const UserValidator = require("../../validators/UserValidator");
const User = require("../../models/User");
const Transaction = require("../../models/Transaction");
const QueueLockService = require("../../services/QueueLockService");

async function setUserAttributes(user, uid) {
  // Set user balances.
  user.availableBalance = await Transaction.getBalanceByUserUid(uid);
  user.balance = await Transaction.getBalanceByUserUid(uid, true);

  return user;
}

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getUsers = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = UserValidator.parseGetUsersAdminRequestParams(req.query);

    // Get id reference for the current state of the index if pitId is not already provided.
    if (!parsedParams.pitId) {
      parsedParams.pitId = await User.getPointInTime();
    }

    const pageSize = 50;
    // Fetch existing users.
    const users = await User.findManyByQueryAdminSearch(parsedParams.searchQuery, parsedParams.filters,
      parsedParams.sortBy, parsedParams.nextPage, parsedParams.pitId, pageSize, { all: true });
    const isLoadMoreEnabled = users.length === pageSize;

    res.status(200).json({ pitId: parsedParams.pitId, users: users, isLoadMoreEnabled: isLoadMoreEnabled });
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

const getUser = async (req, res) => {
  let parsedParams;
  try {
    const { accountType } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = UserValidator.parseUserUidRequestParams(req.query);

    // Get user.
    const users = await User.findManyByUids([parsedParams.uid], undefined,
      { all: true });

    // Throw error if user doesn't exist.
    if (users.length === 0) {
      throw new Error("Provided uid could not be found.",
        {cause: {code: "INVALID_UID"}});
    }

    const user = await setUserAttributes(users[0], parsedParams.uid);

    // Send user.
    res.status(200).json({ user });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case ("INVALID_UID"):
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const updateUser = async (req, res) => {
  let parsedParams;
  try {
    const { accountType, uid } = req.user; // Extract the user's accountType (ADMIN or STAFF).
    parsedParams = UserValidator.parseUpdateUserAdminRequestParams(req.body);

    if (accountType !== User.AccountType.ADMIN) {
      // Only admin accounts can update users.
      throw new Error("User does not have permission to update user.",
        { cause: { code: "ACCESS_FORBIDDEN" } });
    } else if (parsedParams.uid === uid) {
      throw new Error("User cannot update themselves.",
        { cause: { code: "ACCESS_FORBIDDEN" } });
    }

    // Lock requests with the same uid to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.userControllerQueue).processJob({
        uid: parsedParams.uid
      },
      async (session) => {
        // Get user and verify that the uid exists.
        const users = await User.findManyByUids([parsedParams.uid], session);

        if (users.length === 0) {
          throw new Error("Provided user uid could not be found.",
            {cause: {code: "INVALID_UID"}});
        }

        // Update the specified fields in user.
        const user = users[0];
        await User.updateOneById(user._id, parsedParams.fields, session);

        res.status(200).json({ status: "updated" });
      }, { createTransaction: true });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_UID":
        statusCode = 400;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 409;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

module.exports = { getUsers, getUser, updateUser }