const admin = require("firebase-admin");
const {findManyByUids, AccountType} = require("../models/User");

// Initialise firebase auth.
const initialiseClient = () => {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(process.env.FIREBASE_CREDENTIALS),
    });

    return "Firebase admin initialised successfully.";
  } catch (error) {
    console.error(error);
    throw error;
  }
}


// Verify Firebase ID token.
const verifyIdToken = async (idToken) => {
  if (!idToken) {
    throw new Error("No token provided.",
      {cause: {code: "NO_TOKEN_PROVIDED"}});
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken); // Verify token
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      isEmailVerified: decodedToken.email_verified,
    };
  } catch (error) {
    throw new Error("Invalid token.",
      {cause: {code: "INVALID_TOKEN"}});
  }
}

// Middleware to verify Firebase ID token and authorise user.
const authenticateUser = async (req, res, next) => {
  try {
    const idToken = req?.headers?.authorization; // Token sent in the Authorization header.
    req.user = await verifyIdToken(idToken);

    next();
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "NO_TOKEN_PROVIDED":
      case "INVALID_TOKEN":
        statusCode = 401;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

// Middleware to verify user is email verified.
const verifyEmailVerified = async (req, res, next) => {
  try {
    const { isEmailVerified } = req.user; // Extract the user's attributes.

    if (!isEmailVerified) {
      throw new Error("User email not verified.");
    }
    next();
  } catch (error) {
    res.status(401).json({code: "EMAIL_NOT_VERIFIED"});
  }
}

// Middleware to verify user is email verified.
const verifyAdminOrStaff = async (req, res, next) => {
  try {
    const { uid } = req.user; // Extract the user's attributes.
    const users = await findManyByUids(uid);

    if (!users.length) {
      throw new Error("User not found.", {cause: {code: "USER_NOT_FOUND"}});
    }
    const user = users[0];

    // Verify whether user is an ADMIN or STAFF.
    if (![AccountType.ADMIN, AccountType.STAFF].includes(user.accountType)) {
      throw new Error("User is not an admin or staff.", {cause: {code: "ACCESS_FORBIDDEN"}});
    }
    req.user.accountType = user.accountType; // Send accountType to controller.

    next();
  } catch (error) {
    // Set statusCode based on error code.
    let statusCode;
    switch (error?.cause?.code) {
      case "USER_NOT_FOUND":
        statusCode = 401;
        break;
      case "ACCESS_FORBIDDEN":
        statusCode = 403;
        break;
      default:
        console.error(error);
        statusCode = 500;
    }
    res.status(statusCode).json({ code: error?.cause?.code || "UNKNOWN" }); // Send error message.
  }
}

// Middleware to verify Firebase ID token and retrieve user.
const retrieveUser = async (req, res, next) => {
  let idToken;

  // If idToken sent in header, retrieve the user.
  if (req?.headers?.authorization) {
    idToken = req.headers.authorization;

    try {
      req.user = await verifyIdToken(idToken);
    } catch (error) {
      console.error(error);
    }
  }
  next();
}

module.exports = {initialiseClient, verifyIdToken, authenticateUser, verifyEmailVerified, verifyAdminOrStaff, retrieveUser};