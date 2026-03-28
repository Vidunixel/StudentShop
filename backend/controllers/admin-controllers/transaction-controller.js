const TransactionValidator = require("../../validators/TransactionValidator");
const Transaction = require("../../models/Transaction");
const QueueLockService = require("../../services/QueueLockService");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getTransactions = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = TransactionValidator.parseGetTransactionsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Transaction.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing transactions.
    const transactions = await Transaction.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { user: true, detailedItem: true });
    const isLoadMoreEnabled = transactions.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, transactions, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getUserTransactions = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = TransactionValidator.parseGetUserTransactionsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Transaction.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing transactions.
    let transactions = await Transaction.findManyByUserUidSearch(parsedParams.uid, parsedParams.sortBy, parsedParams.nextPage,
      parsedParams.pitId, pageSize, { detailedItem: true });
    const isLoadMoreEnabled = transactions.length === pageSize;

    // Send user cart.
    res.status(200).json({ pitId: parsedParams.pitId, transactions, isLoadMoreEnabled });
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

const getTransaction = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = TransactionValidator.parseTransactionIdRequestParams(req.query);

    // Get transaction.
    const transactions = await Transaction.findManyByIds([parsedParams.id], undefined,
      { user: true, detailedItem: true });

    // Throw error if transaction doesn't exist.
    if (transactions.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }

    const transaction = transactions[0];

    // Send transaction.
    res.status(200).json({ transaction });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case ("INVALID_ID"):
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const updateSaleTransaction = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = TransactionValidator.parseUpdateSaleTransactionAdminRequestParams(req.body);

    // Get transaction.
    const transactions = await Transaction.findManyByIds([parsedParams.id], undefined,
      { purchase: true });

    // Throw error if transaction doesn't exist.
    if (transactions.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }
    const transaction = transactions[0];

    if (transaction.info.transactionType !== Transaction.TransactionType.SALE) {
      throw new Error("Transaction is not of the type SALE.",
        { cause: { code: "ACTION_UNAVAILABLE" } });
    }

    // Lock requests with the same transaction purchase userUid to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue).processJob(
      { uid: transaction.purchase.userUid },
      async (session) => {
        // Re-fetch transaction.
        const transactions = await Transaction.findManyByIds([parsedParams.id], session);

        // Throw error if transaction doesn't exist.
        if (transactions.length === 0) {
          throw new Error("Provided id could not be found.",
            {cause: {code: "INVALID_ID"}});
        }
        const transaction = transactions[0];

        if (transaction.info.transactionType !== Transaction.TransactionType.SALE) {
          throw new Error("Transaction is not of the type SALE.",
            { cause: { code: "ACTION_UNAVAILABLE" } });

        } else if (parsedParams.fields.status != null) {
          if (![Transaction.TransactionStatus.REJECTED, Transaction.TransactionStatus.PENDING].includes(transaction.status)) {
            // If user is trying to place-in-pending/reject transaction when it is not REJECTED or PENDING.
            throw new Error("Transaction status cannot be updated when current status is not REJECTED or PENDING.",
              { cause: { code: "ACTION_UNAVAILABLE" } });
          } else if (transaction.fulfilmentDate == null) {
            throw new Error("Transaction does not have a fulfilment date.",
              {cause: {code: "ACTION_UNAVAILABLE"}});
          }

          // If fulfilmentDate has passed or is within an hour from now, throw error.
          const oneHour = 60 * 60 * 1000;
          if (new Date(transaction.fulfilmentDate) <= new Date(Date.now() + oneHour)) {
            throw new Error("Fulfilment date has passed or is within an hour from now.",
              {cause: {code: "ACTION_UNAVAILABLE"}});
          }
        }

        // Update transaction.
        await Transaction.updateOneById(transaction._id, parsedParams.fields, session);
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

module.exports = { getTransactions, getUserTransactions, getTransaction, updateSaleTransaction }
