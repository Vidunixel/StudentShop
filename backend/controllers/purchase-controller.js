const PaypalPaymentService = require("../services/PaypalPaymentService");
const Purchase = require("../models/Purchase");
const Note = require("../models/Note");
const Transaction = require("../models/Transaction");
const QueueLockService = require("../services/QueueLockService");
const Refund = require("../models/Refund");
const PurchaseValidator = require("../validators/PurchaseValidator");
const Cart = require("../models/Cart");

async function processDuplicatePurchases(uid, paymentMethod, captureId, netAmount) {
  try {
    // If payment method is PayPal (already paid), refund the user the net amount.
    if (paymentMethod === Purchase.PaymentMethod.PAYPAL) {
      const description = "The purchase you made contains one or more items that you already own. " +
        "Contact support if you believe this was a mistake."
      await PaypalPaymentService.refundOrder(captureId, netAmount, description);
    }

    // Empty users cart.
    const carts = await Cart.findManyByUids([uid]);

    if (carts.length) {
      const cart = carts[0];
      await Cart.updateOneById(cart._id, { cartItems: [] });
    }
  } catch (error) {
    console.error(error);
  }
}

function formatPrice(number) {
  return Math.round(Number(number) * 100) / 100;
}

function getPurchaseItems(orderItems, grossAmount, netAmount) {
  // Fees charged by PayPal for the entire order (can include multiple items).
  // Make $0 if netAmount exceeds grossAmount (highly unlikely).
  const orderTransactionFee = Math.max(0, grossAmount - netAmount);

  // Value used to keep track of how orderTransactionFee is split.
  let totalTransactionFeeCount = orderTransactionFee;

  // Convert orderItems to items format.
  return orderItems.map((orderItem, idx) => {
    const skuFirstColonIndex = orderItem.sku.indexOf(':');
    const skuSegments = [orderItem.sku.slice(0, skuFirstColonIndex),
      orderItem.sku.slice(skuFirstColonIndex + 1)];

    // Set the item's share of the orderTransactionFee.
    let itemTransactionFee = 0;
    if (grossAmount > 0) {
      if (idx === orderItems.length - 1) {
        // If item is the last item in orderItems, set the remainder of totalTransactionFeeCount as itemTransactionFee.
        itemTransactionFee = formatPrice(totalTransactionFeeCount);
      } else {
        // Set itemTransactionFee based on item's share of the orderTransactionFee.
        itemTransactionFee = formatPrice(orderTransactionFee *
          ((orderItem.unit_amount.value + orderItem.tax.value) / grossAmount));
      }
      // Subtract itemTransactionFee from totalTransactionFeeCount.
      totalTransactionFeeCount -= itemTransactionFee;
    }

    // Total less tax less transaction fee (amount left to distribute between seller and StudentShop).
    // Make $0 if transaction fee exceeds total less tax (possible as transaction fee is applied on top of tax).
    const itemUnitTotal = Math.max(0, orderItem.unit_amount.value - itemTransactionFee);

    const itemStudentShopFee = formatPrice(itemUnitTotal * 0.15);
    const itemTax = orderItem.tax.value; // Tax.
    const itemTotal = orderItem.unit_amount.value + orderItem.tax.value; // Total plus tax.

    return { _index: skuSegments[0], _id: skuSegments[1], price: {
        unitAmount: {
          sellerReceive: formatPrice(itemUnitTotal - itemStudentShopFee), // 85% of unitTotal.
          studentShopFee: formatPrice(itemStudentShopFee), // 15% of unitTotal.
          unitTotal: formatPrice(itemUnitTotal) // total - transactionFee - tax.
        },
        tax: formatPrice(itemTax),
        transactionFee: formatPrice(itemTransactionFee),
        total: formatPrice(itemTotal) // unitTotal + tax + transactionFee.
      }
    }
  });
}

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const createPurchase = async (req, res, next) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.

    parsedParams = await PurchaseValidator.parseCreatePurchaseRequestParams(req.body, uid);

    if ([Purchase.PaymentMethod.FREE].includes(parsedParams.paymentMethod)) {
      req.paymentMethod = parsedParams.paymentMethod;
      req.cart = parsedParams.cart;
      req.isSendHttpsResponse = true;
      return next(); // Save purchases to db.
    } else if (parsedParams.paymentMethod === Purchase.PaymentMethod.PAYPAL) {
      const { orderId } = await PaypalPaymentService.createPaypalOrder(parsedParams.cart);
      res.status(200).json({ orderId });
    } else {
      throw new Error("Invalid payment method.",
        {cause: {code: "INVALID_PAYMENT_METHOD"}});
    }
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_PARAMETERS":
        statusCode = 400;
        break;
      case "INVALID_PAYMENT_METHOD":
        statusCode = 402;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const capturePurchase = async (req, res, next) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's attributes.

    parsedParams = PurchaseValidator.parseCapturePurchaseParams(req.query);

    if (parsedParams.orderId == null) {
      throw new Error("Invalid parameters for capturePurchase.",
        {cause: {code: "INVALID_PARAMETERS"}});
    }

    const { captureId, grossAmount, netAmount, orderItems, httpResponse } =
      await PaypalPaymentService.capturePaypalOrder(parsedParams.orderId);

    // Save purchases to db.
    req.orderItems = orderItems;
    req.orderId = parsedParams.orderId;
    req.captureId = captureId;
    req.grossAmount = grossAmount;
    req.netAmount = netAmount;
    req.paymentMethod = Purchase.PaymentMethod.PAYPAL;
    next();

    res.status(200).json({ status: "success" });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_PARAMETERS":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const addPurchase = async (req, res) => {
  let uid;
  let captureId;
  let purchaseItems;
  let paymentMethod;
  let netAmount;
  let isSendHttpsResponse;

  try {
    uid = req.user.uid;
    captureId = req.captureId;
    paymentMethod = req.paymentMethod;
    netAmount = req.netAmount;
    let orderItems = req.orderItems;
    let grossAmount = req.grossAmount;
    isSendHttpsResponse = req.isSendHttpsResponse;
    const { orderId, cart } = req;

    // Lock requests with the same uid to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue)
      .processJob({ uid }, async (session) => {
        if (paymentMethod === Purchase.PaymentMethod.FREE) {
          const { unitItems, totalCost } = await PaypalPaymentService.verifyFreeOrder(cart);
          // Format to snake case to maintain consistency with PayPal capture response.
          orderItems = PaypalPaymentService.formatUnitItemsToSnakeCase(unitItems);
          netAmount = totalCost;
          grossAmount = totalCost;
        }
        orderItems = PaypalPaymentService.formatOrderItemsToNumberedValues(orderItems);

        // Convert orderItems to items format.
        purchaseItems = getPurchaseItems(orderItems, grossAmount, netAmount);

        // Get all previous purchases that contain an item about to be purchased by this user.
        const previousPurchasesOfItems = (await Purchase.findManyByItems(
          purchaseItems, uid, undefined, session, { refund: true }));

        // Build array of purchase refunds.
        const purchaseRefunds = previousPurchasesOfItems.map((previousPurchaseOfItem) => previousPurchaseOfItem.refund)
          .filter((refund) => refund != null); // Filter out undefined/null values.

        // Raise error if at least one purchase of an item is not refunded.
        if (previousPurchasesOfItems.length > purchaseRefunds.length) {
          await processDuplicatePurchases(uid, paymentMethod, captureId, netAmount);
          throw new Error("Purchase contains already owned items.",
            {cause: {code: "PURCHASED_ITEM(S)_IN_ORDER"}});
        } // If no PURCHASED_ITEM(S)_IN_ORDER error raised, all purchases in previousPurchasesOfItems have been refunded.

        for (const purchaseItem of purchaseItems) {
          switch (purchaseItem._index) {
            case (Note.indexName):
              // Lock requests with the same item id to run synchronously.
              await new QueueLockService(QueueLockService.ControllerQueue.noteControllerQueue).processJob({ id: purchaseItem._id },
                async () => {
                  // Fetch purchased note.
                  const notes = (await Note.findManyByIds([purchaseItem._id], session));
                  const noteDoc = notes[0];

                  const isItemPaidAndFirstTimePurchase = !previousPurchasesOfItems.some((repurchasingItem) =>
                    repurchasingItem.item._index === purchaseItem._index &&
                    repurchasingItem.item._id === purchaseItem._id) && purchaseItem.price.total;

                  const purchaseDoc = new Purchase({
                    orderId: orderId,
                    userUid: uid,
                    sellerUid: noteDoc.sellerUid,
                    price: purchaseItem.price,
                    paymentMethod: paymentMethod,
                    item: { _index: purchaseItem._index, _id: purchaseItem._id },
                    refundProperties: {
                      // If the item is being purchased for the first time and is not free, set refundExpiryDate.
                      ...(isItemPaidAndFirstTimePurchase ? {
                        refundExpiryDate: new Date(Date.now() + noteDoc.refundPolicy.refundPeriod).toISOString()
                      } : {})
                    }
                  });
                  const purchase = await purchaseDoc.save(session);

                  // Update the note's purchaseCount.
                  await Note.updateOneById(noteDoc._id, { purchaseCount: noteDoc.purchaseCount + 1 }, session);

                  // Create sale transaction doc.
                  const twoDays = 2 * 24 * 60 * 60 * 1000;
                  const transactionDoc = new Transaction({
                    userUid: noteDoc.sellerUid,
                    info: { transactionType: Transaction.TransactionType.SALE, purchaseId: purchase._id },
                    amount: purchase.price.unitAmount.sellerReceive,
                    // Set status to completed if sellerReceive amount is $0.
                    ...(!purchase?.price?.unitAmount?.sellerReceive ? {
                      status: Transaction.TransactionStatus.COMPLETED } : {}),
                    // If refundExpiryDate exists and seller receive more than $0, set fulfilmentDate 2 days after refundExpiryDate.
                    ...(purchase?.refundProperties?.refundExpiryDate && purchase?.price?.unitAmount?.sellerReceive ? {
                      fulfilmentDate: new Date(new Date(purchase.refundProperties.refundExpiryDate).getTime() + twoDays)
                    } : {})
                  });
                  await transactionDoc.save(session);
                });
              break;
          }
        }

        // Empty users cart.
        try {
          const carts = await Cart.findManyByUids([uid], session);

          if (carts.length) {
            const cart = carts[0];
            await Cart.updateOneById(cart._id, { cartItems: [] }, session);
          }
        } catch (error) {
          console.error(error);
        }

        if (isSendHttpsResponse) {
          res.status(200).json({ status: "success" });
        }
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "EMPTY_CART":
        statusCode = 400;
        break;
      case "INSUFFICIENT_FUNDS":
        statusCode = 402;
        break;
      case "ORDER_NOT_FREE":
        statusCode = 403;
        break;
      case ("PURCHASED_ITEM(S)_IN_ORDER"):
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    if (isSendHttpsResponse) {
      res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
    }
  }
}

const refundPurchase = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = PurchaseValidator.parseRefundPurchaseRequestParams(req.body);

    // Lock requests with the same uid to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue)
      .processJob({ uid }, async (session) => {
        const purchases = (await Purchase.findManyByIds([parsedParams.id], session,
          { detailedItem: true, refund: true }));

        if (purchases.length === 0) {
          throw new Error("Provided note id could not be found.",
            { cause: { code: "INVALID_ID" } });
        }

        const purchase = purchases[0];

        if (purchase.userUid !== uid) {
          // If purchase was not made by this user, throw error.
          throw new Error("User does not have permission to refund purchase.",
            { cause: { code: "ACCESS_FORBIDDEN" } });
        }

        // If purchase has already been refunded, raise error.
        if (purchase.refund != null) {
          throw new Error("User has already refunded this purchase.",
            { cause: { code: "PURCHASE_ALREADY_REFUNDED" } });
        }

        let isRefundAvailable = false;
        let isApprovalRequired = true;
        switch (purchase.detailedItem._index) {
          case (Note.indexName):
            if (!purchase.detailedItem.refundPolicy?.acceptedReasons?.includes(parsedParams.reasonType)) {
              throw new Error("Refund cannot be fulfilled for the user's stated reason.",
                { cause: { code: "REASON_UNACCEPTED" } });
            }

            // Set isApprovalRequired to false if note's isApprovalRequired attribute is explicitly false.
            isApprovalRequired = !(purchase.detailedItem.refundPolicy?.isApprovalRequired === false);

            const refundExpiryDate = new Date(purchase.refundProperties?.refundExpiryDate);
            const isRefundRestricted = purchase.refundProperties?.isRefundRestricted;

            // Set isRefundAvailable to true or false.
            isRefundAvailable = refundExpiryDate ? new Date() <= refundExpiryDate && !isRefundRestricted : false;
            break;
        }

        const saleTransactions = await Transaction.findOneByPurchaseIdAndType(purchase._id,
          Transaction.TransactionType.SALE, Transaction.TransactionStatus.PENDING, session);

        if (!isRefundAvailable || !saleTransactions.length) {
          throw new Error("Refund is unavailable.",
            { cause: { code: "REFUND_UNAVAILABLE" } });
        }

        // Sale transaction going to seller.
        const saleTransaction = saleTransactions[0];

        // Create and save refund doc if isRefundAvailable is true.
        const refundDoc = new Refund({
          purchaseId: purchase._id,
          reasonType: parsedParams.reasonType,
          reasonDescription: parsedParams.reasonDescription,
          status: Refund.RefundStatus.AWAITING_APPROVAL
        });
        const refund = await refundDoc.save(session);

        // Reject the original sale transaction going to seller.
        await Transaction.updateOneById(saleTransaction._id,
          { status: Transaction.TransactionStatus.REJECTED }, session);

        // Create refund transaction doc.
        const transactionDoc = new Transaction({
          userUid: uid,
          info: { transactionType: Transaction.TransactionType.REFUND, purchaseId: purchase._id },
          amount: formatPrice(purchase.price.total - purchase.price.transactionFee),
          status: Transaction.TransactionStatus.PENDING
        });
        const transaction = await transactionDoc.save(session);

        // Set statuses as completed if approval is not required.
        if (!isApprovalRequired) {
          await Transaction.updateOneById(transaction._id,  { status: Transaction.TransactionStatus.COMPLETED }, session);
          await Refund.updateOneById(refund._id, { status: Refund.RefundStatus.COMPLETED }, session);
        }

        res.status(200).json({ status: "refunded" });
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "REASON_UNACCEPTED":
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
        break;
      case "PURCHASE_ALREADY_REFUNDED":
      case "REFUND_UNAVAILABLE":
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getUserPurchases = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = PurchaseValidator.parseGetUserPurchasesRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Purchase.getPointInTime();
    }

    const pageSize = 25;
    // Fetch existing purchases.
    let purchases = await Purchase.findManyByUserUidSearch(uid, undefined, false,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { detailedItem: true, refund: true });
    const isLoadMoreEnabled = purchases.length === pageSize;

    // For each queried purchase.
    purchases = purchases.map((purchase) => {
      const filteredPurchase = Purchase.filterAttributesForOwner(purchase);

      // Set display status.
      if (purchase.refund?.status === Refund.RefundStatus.COMPLETED) {
        filteredPurchase.displayStatus = Purchase.DisplayStatus.REFUNDED;
      } else if (purchase.refund?.status === Refund.RefundStatus.AWAITING_APPROVAL) {
        filteredPurchase.displayStatus = Purchase.DisplayStatus.PENDING_REFUND;
      } else if (purchase.status === Purchase.PurchaseStatus.PAID) {
        filteredPurchase.displayStatus = Purchase.DisplayStatus.PAID;
      }

      if (purchase.refund != null) {
        // If purchase has been refunded, set 'isRefundAvailable' to false.
        filteredPurchase.isRefundAvailable = false;
      } else {
        // Else, set 'isRefundAvailable' based on refundExpiryDate and isRefundRestricted.
        const refundExpiryDate = new Date(purchase.refundProperties?.refundExpiryDate);
        const isRefundRestricted = purchase.refundProperties?.isRefundRestricted;
        filteredPurchase.isRefundAvailable = refundExpiryDate ? new Date() <= refundExpiryDate && !isRefundRestricted : false;
      }

      return filteredPurchase;
    });

    res.status(200).json({ pitId: parsedParams.pitId, purchases, isLoadMoreEnabled });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { createPurchase, capturePurchase, addPurchase, getUserPurchases, refundPurchase }
