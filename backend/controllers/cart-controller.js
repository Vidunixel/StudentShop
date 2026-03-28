const CartValidator = require("../validators/CartValidator");
const QueueLockService = require("../services/QueueLockService");
const Cart = require("../models/Cart");

async function createCart(uid) {
  let userCart = null;

  // Lock requests with the same uid to run synchronously to avoid duplication.
  await new QueueLockService(QueueLockService.ControllerQueue.userControllerQueue).processJob({
    uid: uid
  }, async () => {

    // Check again if user already has a cart created.
    const carts = await Cart.findManyByUids([uid]);

    // If cart does not exist for user, create one.
    if (!carts.length) {
      const cartDoc = new Cart({ userUid: uid });
      userCart = await cartDoc.save();
    }
  });

  return userCart;
}

/************************************************************************************************
 * Controllers
 * **********************************************************************************************/

const getCart = async (req, res) => {
  try {
    const { uid } = req.user; // Extract the user's unique ID.

    let cartItems;
    const carts = await Cart.findManyByUids([uid]);

    if (carts.length > 0) {
      cartItems = carts[0]?.cartItems;
    } else {
      // If cart does not exist for user, create one.
      cartItems = (await createCart(uid))?.cartItems;
    }

    // Send user cart.
    res.status(200).json({ cartItems });
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

const updateCart = async (req, res) => {
  let parsedParams;
  try {
    const { uid } = req.user; // Extract the user's unique ID.

    parsedParams = await CartValidator.parseUpdateCartRequestParams(req.body, uid);

    let userCart;
    const carts = await Cart.findManyByUids([uid]);

    if (carts.length > 0) {
      userCart = carts[0];
    } else {
      // If cart does not exist for user, create one.
      userCart = (await createCart(uid));
    }

    await Cart.updateOneById(userCart._id, parsedParams.fields);

    // Re-fetch cart.
    let cartItems;
    const newlyFetchedCarts = await Cart.findManyByIds([userCart._id]);
    if (carts.length > 0) {
      cartItems = newlyFetchedCarts[0]?.cartItems;
    }

    // Send user cart.
    res.status(200).json({ cartItems });
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

module.exports = { getCart, updateCart }
