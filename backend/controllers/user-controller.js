const UserValidator = require("../validators/UserValidator");
const {r2} = require("../server");
const User = require("../models/User");
const sharp = require("sharp");
const {v4: uuidv4, v5: uuidv5 } = require("uuid");
const {PutObjectCommand, DeleteObjectCommand} = require("@aws-sdk/client-s3");
const QueueLockService = require("../services/QueueLockService");
const Transaction = require("../models/Transaction");
const Cart = require("../models/Cart");
const multer = require("multer");
const path = require('path');
const Purchase = require("../models/Purchase");
const {Environment} = require("../models/common");

async function batchSetUserAttributes(users, uid, isFilterAttributes = true) {
  let filteredUsers = [];

  if (users.length > 0) {
    for (const user of users) {
      // Filter out private user details for public or owner.
      let filteredUser;
      if (isFilterAttributes && (user.uid == null || uid == null || user.uid !== uid)) {
        filteredUser = User.filterAttributesForPublic(user);
      } else if (isFilterAttributes) {
        filteredUser = User.filterAttributesForOwner(user);
        // Set user balances.
        filteredUser.availableBalance = await Transaction.getBalanceByUserUid(uid);
        filteredUser.balance = await Transaction.getBalanceByUserUid(uid, true);
      } else {
        filteredUser = user;
      }

      filteredUsers.push(filteredUser);
    }
  }

  return filteredUsers;
}

const profilePicUpload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for profile pictures.
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files (jpeg, jpg, png, gif) are allowed for profile pictures.",
        { cause: { code: "UNSUPPORTED_FILE_TYPE" } }));
    }
  }
});

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const uploadProfilePic = (req, res, next) => {
  profilePicUpload.single('profilePic')(req, res, (err) => {
    if (err) {
      // Set statusCode based on error code.
      let statusCode;
      switch (err?.cause?.code || err?.code) {
        case "UNSUPPORTED_FILE_TYPE":
        case "LIMIT_PART_COUNT":
        case "LIMIT_FILE_SIZE":
        case "LIMIT_FILE_COUNT":
        case "LIMIT_FIELD_KEY":
        case "LIMIT_FIELD_VALUE":
        case "LIMIT_FIELD_COUNT":
        case "LIMIT_UNEXPECTED_FILE":
        case "MISSING_FIELD_NAME":
          statusCode = 400;
          break;
        default:
          console.error(err);
          statusCode = 500;
      }
      res.status(statusCode).json({ code: err?.cause?.code || err?.code || "UNKNOWN" }); // Send error message.
    } else {
      // Call the controller function to handle the rest of the logic.
      next();
    }
  });
}

const getUser = async (req, res) => {
  try {
    const { uid } = req.user; // Extract the user's unique ID.

    // Get user.
    const users = await User.findManyByUids([uid], undefined, { all: true });

    // Throw error if user doesn't exist.
    if (users.length === 0) {
      throw new Error("Provided user id could not be found.",
        {cause: {code: "INVALID_UID"}});
    }

    // Add attributes to user.
    const user = (await batchSetUserAttributes(users, uid))[0];

    // Send user.
    res.status(200).json({ user: user });
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

const getUsernameStatus = async (req, res) => {
  let parsedParams;
  try {
    parsedParams = UserValidator.parseGetUsernameStatusRequestParams(req.query);

    // Get user.
    const users = await User.findOneByUsername(parsedParams.username);
    const status = users.length > 0 ? "USERNAME_ALREADY_EXISTS" : "USERNAME_IS_FREE";

    // Send username status.
    res.status(200).json({ status: status });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case ("INVALID_PARAMETERS"):
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const addUser = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's unique ID.

    parsedParams = await UserValidator.parseAddUserRequestParams(req.body);
    parsedParams.uid = uid;

    // Lock requests with the same uid or username to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.userControllerQueue).processJob({
      uid: parsedParams.uid,
      username: parsedParams.username
    }, async (session) => {
      // Check if username or uid already exists before saving.
      const usersByUid = await User.findManyByUids([uid], session);
      const usersByUsername = await User.findOneByUsername(parsedParams.username, session);

      if (usersByUid.length > 0) {
        throw new Error("Uid already exists.",
          {cause: {code: "UID_ALREADY_EXISTS"}});
      } else if (usersByUsername.length > 0) {
        throw new Error("Username already exists.",
          {cause: {code: "USERNAME_ALREADY_EXISTS"}});
      }

      // Create and save user.
      const userDoc = new User(parsedParams);
      const user = await userDoc.save(session);

      // Create a cart for user.
      try {
        // Check if user already has a cart created.
        const carts = await Cart.findManyByUids([uid], session);

        if (carts.length > 0) {
          throw new Error("User already has a cart.",
            {cause: {code: "USER_CART_ALREADY_EXISTS"}});
        }

        // Create cart document.
        const cartDoc = new Cart({ userUid: parsedParams.uid });
        await cartDoc.save(session);
      } catch (error) {
        console.error(error);
      }

      // Send saved user.
      res.status(200).json({ user: User.filterAttributesForOwner(user) });
    }, { createTransaction: true });

  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "UID_ALREADY_EXISTS":
      case "USERNAME_ALREADY_EXISTS":
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

const updateUser = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's unique ID.
    parsedParams = await UserValidator.parseUpdateUserRequestParams(req.body);

    // Lock requests with the same uid or username (if provided) to run synchronously to avoid duplication.
    await new QueueLockService(QueueLockService.ControllerQueue.userControllerQueue).processJob({
        uid,
        ...(parsedParams.fields.username ? { username: parsedParams.fields.username } : {})
      },
      async (session) => {
        // Get user and verify that the uid exists.
        const users = await User.findManyByUids([uid], session);

        if (users.length === 0) {
          throw new Error("Provided user uid could not be found.",
            {cause: {code: "INVALID_UID"}});
        }

        // If username is provided, check if it is available.
        if (parsedParams.fields.username) {
          const usersByUsername = await User.findOneByUsername(parsedParams.fields.username, session);

          if (usersByUsername.length > 0) {
            throw new Error("Username already exists.",
              {cause: {code: "USERNAME_ALREADY_EXISTS"}});
          }
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
      case "USERNAME_ALREADY_EXISTS":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const updateProfilePic = async (req, res) => {
  try {
    const { uid } = req.user; // Extract the user's unique ID.
    const { file } = req;

    // Lock requests with the same uid to run synchronously.
    await new QueueLockService(QueueLockService.ControllerQueue.userControllerQueue).processJob({ uid }, async () => {
      // R2 bucket name.
      const profilePicBucketName = process.env.ENVIRONMENT === Environment.PRODUCTION ? "public-profile-pictures" : "dev-public-profile-pictures";

      if (!file) {
        throw new Error("No profile picture uploaded.",
          {cause: {code: "FILE_NOT_UPLOADED"}});
      }

      // Generate unique uuid from original filename.
      const uniqueName = uuidv5(file.originalname, uuidv4()) + ".webp";

      // Compress and save using Sharp.
      const processedImageBuffer = await sharp(file.buffer)
        .rotate() // Auto-rotate based on EXIF data.
        .resize(180, 180, { fit: "cover" }) // Resize to a max width of 180px by 180px.
        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Replace transparency with white.
        .webp({ quality: 100 }) // Convert to WebP with 100% quality.
        .toBuffer();

      await r2.send(new PutObjectCommand({
        Bucket: profilePicBucketName,
        Key: uniqueName,
        Body: processedImageBuffer,
        ContentType: "image/webp"
      }));

      // Get user.
      const users = await User.findManyByUids([uid]);

      // Throw error if user doesn't exist.
      if (users.length === 0) {
        throw new Error("Provided user id could not be found.",
          {cause: {code: "INVALID_UID"}});
      }

      // Update the profilePic field in user.
      let user = users[0];
      await User.updateOneById(user._id, { profilePic: uniqueName });

      // Delete old profilePic if it is not the default profilePic.
      try {
        if (user.profilePic !== "default.svg") {
          await r2.send(new DeleteObjectCommand({
            Bucket: profilePicBucketName,
            Key: user.profilePic
          }));
        }
      } catch (error) {
        console.error(error);
      }

      res.status(200).json({ status: "updated" });
    });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "INVALID_UID":
      case "FILE_NOT_UPLOADED":
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getProfile = async (req, res) => {
  let parsedParams;
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID if logged in.
    parsedParams = UserValidator.parseGetProfileRequestParams(req.query);

    // Get user.
    const users = await User.findOneByUsername(parsedParams.username, undefined,
      { all: true });

    // Throw error if user doesn't exist.
    if (users.length === 0) {
      throw new Error("Provided username could not be found.",
        {cause: {code: "INVALID_USERNAME"}});
    }

    const user = (await batchSetUserAttributes(users, uid))[0];

    // Send user.
    res.status(200).json({ user });
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case ("INVALID_USERNAME"):
        statusCode = 400;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

const getProfilesBySales = async (req, res) => {
  try {
    const uid = req?.user?.uid; // Extract the user's unique ID if logged in.

    const userUidsBySales = await Purchase.getUserUidsByRecentSalesSearch();

    const users = await User.findManyByUids(userUidsBySales, undefined, { all: true });
    const filteredUsers = await batchSetUserAttributes(users, uid);

    res.status(200).json({ users: filteredUsers });
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

module.exports = { getUser, getUsernameStatus, addUser, updateUser, getProfile, uploadProfilePic, updateProfilePic,
  getProfilesBySales }
