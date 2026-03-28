const QueueLockService = require("./QueueLockService");
const Transaction = require("../models/Transaction");
const cron = require("node-cron");

async function processUnfulfilledSaleTransactions() {
  try {
    const unfulfilledTransactions = (await Transaction.findManyUnfulfilledSales({ purchase: true }));

    // For each unfulfilled transaction.
    for (const unfulfilledTransaction of unfulfilledTransactions) {
      // Lock requests with the same transaction purchase userUid to run synchronously to avoid duplication.
      await new QueueLockService(QueueLockService.ControllerQueue.purchaseTransactionRefundControllerQueue)
        .processJob({ uid: unfulfilledTransaction.purchase.userUid }, async (session) => {
          // Refetch transaction.
          const transactions = await Transaction.findManyByIds([unfulfilledTransaction._id], session);

          // If transaction still exists.
          if (transactions.length) {
            const transaction = transactions[0];

            // Recheck type, status and fulfilment date on job process.
            if (
              transaction.info.transactionType === Transaction.TransactionType.SALE &&
              transaction.status === Transaction.TransactionStatus.PENDING &&
              new Date(transaction.fulfilmentDate) < new Date()
            ) {
              // Update transaction document status to 'completed'.
              await Transaction.updateOneById(transaction._id,
                { status: Transaction.TransactionStatus.COMPLETED }, session);
            }
          }
        }, { createTransaction: true });
    }
  } catch (error) {
    console.error(error);
  }
}

function startProcessUnfulfilledSaleTransactionsJob() {
  // Run at midnight every day.
  const job = cron.schedule("0 0 * * *", processUnfulfilledSaleTransactions);
  job.start();
  return job;
}

module.exports = { startProcessUnfulfilledSaleTransactionsJob };