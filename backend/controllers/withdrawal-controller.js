const QueueLockService = require("../services/QueueLockService");
const Transaction = require("../models/Transaction");
const PayPalPaymentService = require("../services/PaypalPaymentService");
const WithdrawalValidator = require("../validators/WithdrawalValidator");
const Withdrawal = require("../models/Withdrawal");

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const withdrawBalance = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID.
    parsedParams = WithdrawalValidator.parseWithdrawBalanceRequestParams(req.body);

    // Lock requests with the same uid to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue)
      .processJob({ uid }, async (session) => {
        // Verify balance.
        await PayPalPaymentService.verifyWithdrawal(uid, parsedParams.amount, session);

        // Create and save withdrawal transaction doc.
        const transactionDoc = new Transaction({
          userUid: uid,
          info: {
            transactionType: Transaction.TransactionType.WITHDRAWAL
          },
          amount: -Math.abs(parsedParams.amount), // Negate payout amount.
          status: Transaction.TransactionStatus.PENDING,
        });
        const transaction = await transactionDoc.save(session);

        // Create and save withdrawal doc.
        const withdrawalDoc = new Withdrawal({
          transactionId: transaction._id,
          paypalRecipient: {
            recipientType: parsedParams.recipientType,
            identifier: parsedParams.identifier
          }
        });
        await withdrawalDoc.save(session);

      }, { createTransaction: true });

    res.status(200).json({ status: "success" });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_PARAMETERS":
        statusCode = 400;
        break;
      case "INSUFFICIENT_FUNDS":
        statusCode = 402;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { withdrawBalance }
