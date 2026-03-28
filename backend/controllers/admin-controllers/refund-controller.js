const Refund = require("../../models/Refund");
const RefundValidator = require("../../validators/RefundValidator");
const QueueLockService = require("../../services/QueueLockService");
const Transaction = require("../../models/Transaction");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getRefunds = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = RefundValidator.parseGetRefundsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Refund.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing refunds.
    let refunds = await Refund.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { purchase: true });
    const isLoadMoreEnabled = refunds.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, refunds, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getRefund = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = RefundValidator.parseRefundIdRequestParams(req.query);

    // Get refund matching the _id.
    const refunds = await Refund.findManyByIds([parsedParams.id], undefined, { purchase: true });

    // Raise error if response contains no results, else respond with the first refund.
    if (refunds.length === 0) {
      throw new Error("Provided refund id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    const refund = refunds[0];

    res.status(200).json({ refund });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const updateRefund = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = RefundValidator.parseUpdateRefundAdminRequestParams(req.body);

    // Get refund.
    const refunds = await Refund.findManyByIds([parsedParams.id], undefined,
      { purchase: true });

    // Throw error if refund doesn't exist.
    if (refunds.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }
    const refund = refunds[0];

    // Lock requests with the same refund purchase userUid to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue).processJob(
      { uid: refund.purchase.userUid },
      async (session) => {
        // Re-fetch refund.
        const refunds = await Refund.findManyByIds([parsedParams.id], session);

        // Throw error if refund doesn't exist.
        if (refunds.length === 0) {
          throw new Error("Provided id could not be found.",
            {cause: {code: "INVALID_ID"}});
        }
        const refund = refunds[0];

        if (parsedParams.fields.status != null) {
          if (refund.status !== Refund.RefundStatus.AWAITING_APPROVAL) {
            // If user is trying to approve/reject refund when it is not AWAITING_APPROVAL.
            throw new Error("Refund status cannot be updated when current status is not AWAITING_APPROVAL.",
              { cause: { code: "ACTION_UNAVAILABLE" } });
          }

          // Refund transaction going to buyer.
          const refundTransactions = await Transaction.findOneByPurchaseIdAndType(refund.purchaseId,
            Transaction.TransactionType.REFUND, undefined, session);

          if (refundTransactions.length === 0) {
            throw new Error("Transaction associated with the refund does not exist.");
          }
          const refundTransaction = refundTransactions[0];

          if (parsedParams.fields.status === Refund.RefundStatus.COMPLETED) {
            // Approve refund transaction going to buyer.
            await Transaction.updateOneById(refundTransaction._id, { status:
              Transaction.TransactionStatus.COMPLETED }, session);

          } else if (parsedParams.fields.status === Refund.RefundStatus.REJECTED) {
            // Reject refund transaction going to buyer.
            await Transaction.updateOneById(refundTransaction._id, { status:
              Transaction.TransactionStatus.REJECTED }, session);

            // Sale transaction going to seller.
            const saleTransactions = await Transaction.findOneByPurchaseIdAndType(refund.purchaseId,
              Transaction.TransactionType.SALE, undefined, session);

            // Approve the original sale transaction going to seller.
            if (saleTransactions.length) {
              const saleTransaction = saleTransactions[0];
              await Transaction.updateOneById(saleTransaction._id,
                { status: Transaction.TransactionStatus.COMPLETED }, session);
            }
          }
        }

        // Update refund.
        await Refund.updateOneById(refund._id, parsedParams.fields, session);
      }, { createTransaction: true });

    res.status(200).json({ status: "updated" });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_ID":
        statusCode = 400;
        break;
      case "ACTION_UNAVAILABLE":
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getRefunds, getRefund, updateRefund }
