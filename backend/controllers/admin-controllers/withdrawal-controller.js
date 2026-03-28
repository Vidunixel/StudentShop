const TransactionValidator = require("../../validators/TransactionValidator");
const Transaction = require("../../models/Transaction");
const QueueLockService = require("../../services/QueueLockService");
const WithdrawalValidator = require("../../validators/WithdrawalValidator");
const Withdrawal = require("../../models/Withdrawal");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getWithdrawals = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = WithdrawalValidator.parseGetWithdrawalsAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await Withdrawal.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing withdrawals.
    const withdrawals = await Withdrawal.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize,
      { transaction: true });
    const isLoadMoreEnabled = withdrawals.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, withdrawals, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getWithdrawal = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = WithdrawalValidator.parseWithdrawalIdRequestParams(req.query);

    // Get withdrawal.
    const withdrawals = await Withdrawal.findManyByIds([parsedParams.id], undefined,
      { transaction: true });

    // Throw error if withdrawal doesn't exist.
    if (withdrawals.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }

    const withdrawal = withdrawals[0];

    // Send withdrawal.
    res.status(200).json({ withdrawal });
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

const updateWithdrawal = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = WithdrawalValidator.parseUpdateWithdrawalAdminRequestParams(req.body);

    // Get withdrawal.
    const withdrawals = await Withdrawal.findManyByIds([parsedParams.id], undefined,
      { transaction: true });

    // Throw error if withdrawal doesn't exist.
    if (withdrawals.length === 0) {
      throw new Error("Provided id could not be found.",
        {cause: {code: "INVALID_ID"}});
    }
    const withdrawal = withdrawals[0];

    // Lock requests with the same withdrawal transaction userUid to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue).processJob(
      { uid: withdrawal.transaction.userUid },
      async (session) => {
        // Re-fetch withdrawal.
        const withdrawals =  await Withdrawal.findManyByIds([parsedParams.id], session);

        // Throw error if withdrawal doesn't exist.
        if (withdrawals.length === 0) {
          throw new Error("Provided id could not be found.",
            {cause: {code: "INVALID_ID"}});
        }
        const withdrawal = withdrawals[0];

        // Is status is provided, update associated transaction along with withdrawal.
        if (parsedParams.fields.status === Withdrawal.WithdrawalStatus.REJECTED) {
          await Transaction.updateOneById(withdrawal.transactionId, { status: Transaction.TransactionStatus.REJECTED }, session);
        } else if (parsedParams.fields.status === Withdrawal.WithdrawalStatus.COMPLETED) {
          await Transaction.updateOneById(withdrawal.transactionId, { status: Transaction.TransactionStatus.COMPLETED }, session);
        }

        // Update withdrawal.
        await Withdrawal.updateOneById(withdrawal._id, parsedParams.fields, session);
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

module.exports = { getWithdrawals, getWithdrawal, updateWithdrawal }
