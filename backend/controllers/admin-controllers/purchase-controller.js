const Purchase = require("../../models/Purchase");
const Refund = require("../../models/Refund");
const PurchaseValidator = require("../../validators/PurchaseValidator");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getPurchases = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = PurchaseValidator.parseGetPurchasesAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Purchase.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing purchases.
    let purchases = await Purchase.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { user: true, seller: true, detailedItem: true, refund: true });
    const isLoadMoreEnabled = purchases.length === pageSize;

    // For each queried purchase.
    purchases = purchases.map((purchase) => {
      // Set display status.
      if (purchase.refund?.status === Refund.RefundStatus.COMPLETED) {
        purchase.displayStatus = Purchase.DisplayStatus.REFUNDED;
      } else if (purchase.refund?.status === Refund.RefundStatus.AWAITING_APPROVAL) {
        purchase.displayStatus = Purchase.DisplayStatus.PENDING_REFUND;
      } else if (purchase.status === Purchase.PurchaseStatus.PAID) {
        purchase.displayStatus = Purchase.DisplayStatus.PAID;
      }

      return purchase;
    });

    res.status(200).json({ pitId: parsedParams.pitId, purchases, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getPurchase = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = PurchaseValidator.parsePurchaseIdRequestParams(req.query);

    // Get note matching the _id.
    const purchases = await Purchase.findManyByIds([parsedParams.id], undefined, { all: true });

    // Raise error if response contains no results, else respond with the first purchase.
    if (purchases.length === 0) {
      throw new Error("Provided purchase id could not be found.",
        { cause: { code: "INVALID_ID" } });
    }

    let purchase = purchases[0];

    if (purchase.refund != null) {
      // If purchase has been refunded, set 'isRefundAvailable' to false.
      purchase.isRefundAvailable = false;
    } else {
      // Else, set 'isRefundAvailable' based on refundExpiryDate and isRefundRestricted.
      const refundExpiryDate = new Date(purchase.refundProperties?.refundExpiryDate);
      const isRefundRestricted = purchase.refundProperties?.isRefundRestricted;
      purchase.isRefundAvailable = refundExpiryDate ? new Date() <= refundExpiryDate && !isRefundRestricted : false;
    }

    res.status(200).json({ purchase });
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

const getUserPurchases = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = PurchaseValidator.parseGetUserPurchasesAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Purchase.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing purchases.
    let purchases = await Purchase.findManyByUserUidSearch(parsedParams.uid, undefined, false,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { detailedItem: true, refund: true, seller: true });
    const isLoadMoreEnabled = purchases.length === pageSize;

    // For each queried purchase.
    purchases = purchases.map((purchase) => {
      // Set display status.
      if (purchase.refund?.status === Refund.RefundStatus.COMPLETED) {
        purchase.displayStatus = Purchase.DisplayStatus.REFUNDED;
      } else if (purchase.refund?.status === Refund.RefundStatus.AWAITING_APPROVAL) {
        purchase.displayStatus = Purchase.DisplayStatus.PENDING_REFUND;
      } else if (purchase.status === Purchase.PurchaseStatus.PAID) {
        purchase.displayStatus = Purchase.DisplayStatus.PAID;
      }

      if (purchase.refund != null) {
        // If purchase has been refunded, set 'isRefundAvailable' to false.
        purchase.isRefundAvailable = false;
      } else {
        // Else, set 'isRefundAvailable' based on refundExpiryDate and isRefundRestricted.
        const refundExpiryDate = new Date(purchase.refundProperties?.refundExpiryDate);
        const isRefundRestricted = purchase.refundProperties?.isRefundRestricted;
        purchase.isRefundAvailable = refundExpiryDate ? new Date() <= refundExpiryDate && !isRefundRestricted : false;
      }

      return purchase;
    });

    res.status(200).json({ pitId: parsedParams.pitId, purchases, isLoadMoreEnabled });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_UID":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getPurchases, getPurchase, getUserPurchases }
