const Note = require("../models/Note");
const Transaction = require("../models/Transaction");
const PaypalServer = require("@paypal/paypal-server-sdk");
const Validator = require("../validators/Validator");
const {Environment} = require("../models/common");

function formatPrice(number) {
  return Math.round(Number(number) * 100) / 100;
}

class PaypalPaymentService {
  static #paypalServerClient = new PaypalServer.Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: process.env.PAYPAL_CLIENT_ID,
      oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    },
    timeout: 0,
    environment: process.env.ENVIRONMENT === Environment.PRODUCTION ? PaypalServer.Environment.Production : PaypalServer.Environment.Sandbox
  });
  static #ordersController = new PaypalServer.OrdersController(PaypalPaymentService.#paypalServerClient);
  static #paymentsController = new PaypalServer.PaymentsController(PaypalPaymentService.#paypalServerClient);

  static async capturePaypalOrder(orderId) {
    try {
      const { body } = await PaypalPaymentService.#ordersController.ordersCapture({
        id: orderId,
        prefer: "return=minimal",
      });

      const parsedBody = Validator.parsePaypalCaptureOrderResponse(body);

      const capture = parsedBody.purchase_units[0].payments.captures[0];
      const captureId = capture.id;
      const grossAmount = Number(capture.seller_receivable_breakdown.gross_amount.value);
      const netAmount = Number(capture.seller_receivable_breakdown.net_amount.value);

      const orderItems = await PaypalPaymentService.#getOrderDetails(orderId); // Return items in order.

      return { captureId, grossAmount, netAmount, orderItems };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  static async verifyFreeOrder(cart) {
    if (!cart || cart.length === 0) {
      throw new Error("Cart is empty.",
        {cause: {code: "EMPTY_CART"}});
    }

    const { totalCost, unitItems } =
      await PaypalPaymentService.#getCartItemsBreakdown(cart);

    if (totalCost !== 0) {
      throw new Error("Cart total is not zero.",
        {cause: {code: "ORDER_NOT_FREE"}});
    }

    return { unitItems, totalCost };
  }

  static async createPaypalOrder(cart) {
    try {
      if (!cart || cart.length === 0) {
        throw new Error("Cart is empty.",
          {cause: {code: "EMPTY_CART"}});
      }

      const { totalCost, breakdownItemTotal, breakdownTaxTotal, unitItems } =
        await PaypalPaymentService.#getCartItemsBreakdown(cart);

      let { body } = await PaypalPaymentService.#ordersController.ordersCreate({
        body: {
          intent: PaypalServer.CheckoutPaymentIntent.Capture,
          purchaseUnits: [
            {
              amount: {
                currencyCode: "AUD",
                value: formatPrice(totalCost).toFixed(2),
                breakdown: {
                  itemTotal: {currencyCode: "AUD", value: formatPrice(breakdownItemTotal).toFixed(2)},
                  taxTotal: {currencyCode: "AUD", value: formatPrice(breakdownTaxTotal).toFixed(2)}
                }
              },
              items: unitItems
            },
          ],
          paymentSource: {
            paypal: {
              experienceContext: {
                shippingPreference: PaypalServer.ShippingPreference.NoShipping,
                userAction: PaypalServer.PaypalExperienceUserAction.PayNow,
                paymentMethodPreference: PaypalServer.PayeePaymentMethodPreference.ImmediatePaymentRequired,
                locale: "en-AU"
              }
            }
          },
        },
        prefer: "return=minimal",
      });

      const parsedBody = Validator.parsePaypalCreateOrderResponse(body);
      const orderId = parsedBody.id;

      return { orderId };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  static async #getOrderDetails(orderId) {
    try {
      let { body } = await PaypalPaymentService.#ordersController.ordersGet(
        {
          id: orderId
        });

      const parsedBody = Validator.parsePaypalGetOrderResponse(body);
      const items = parsedBody.purchase_units[0].items;

      return items;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  static async #getCartItemsBreakdown(cart) {
    // Create a list of ids to search for in each index.
    let noteIdsToSearch = [];
    for (const cartItem of cart) {
      switch (cartItem._index) {
        case (Note.indexName):
          noteIdsToSearch.push(cartItem._id);
          break;
      }
    }

    const noteItems = (await Note.findManyByIds(noteIdsToSearch));

    // A list of matched items from all indexes in db format.
    const items = [...noteItems];

    // A list of matched items from all indexes in PayPal item format.
    const unitItems = items.map((item) => {
      const gst = formatPrice(item.price / 11);
      switch (item._index) {
        case (Note.indexName):
          return {
            name: item.title,
            quantity: (1).toFixed(0),
            description: item.description,
            sku: `${item._index}:${item._id}`,
            url: `https://studentshop.com.au/notes/${item._id}`,
            category: "DIGITAL_GOODS",
            unitAmount: {currencyCode: "AUD", value: formatPrice(item.price - gst).toFixed(2)},
            tax: {currencyCode: "AUD", value: formatPrice(gst).toFixed(2)}
          };
      }
    });

    let totalCost = 0;
    let breakdownItemTotal = 0;
    let breakdownTaxTotal = 0;
    unitItems.forEach(unitItem => {
      const unitAmountValue = Number(unitItem.unitAmount.value);
      const unitTaxValue = Number(unitItem.tax.value);
      totalCost += unitAmountValue + unitTaxValue;
      breakdownItemTotal += unitAmountValue;
      breakdownTaxTotal += unitTaxValue;
    });

    return { totalCost, breakdownItemTotal, breakdownTaxTotal, unitItems };
  }

  static formatOrderItemsToNumberedValues(orderItems) {
    orderItems = orderItems.map((orderItem) => {
      orderItem.unit_amount.value = Number(orderItem.unit_amount.value);
      orderItem.tax.value = Number(orderItem.tax.value);
      return orderItem;
    });

    return orderItems;
  }

  static formatUnitItemsToSnakeCase(unitItems) {
    unitItems = unitItems.map((unitItem) => {
      return {
        name: unitItem.name,
        quantity: unitItem.quantity,
        description: unitItem.description,
        sku: unitItem.sku,
        url: unitItem.url,
        category: unitItem.category,
        unit_amount: {currency_code: unitItem.unitAmount.currencyCode, value: unitItem.unitAmount.value},
        tax: {currency_code: unitItem.tax.currencyCode, value: unitItem.tax.value}
      };
    });

    return unitItems;
  }

  static async refundOrder(captureId, amount, description) {
    try {
      await PaypalPaymentService.#paymentsController.capturesRefund(
        {
          captureId: captureId,
          body: {
            noteToPayer: description,
            amount: {
              currencyCode: "AUD",
              value: formatPrice(amount).toFixed(2)
            }
          },
          prefer: "return=minimal"
      });
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  static async verifyWithdrawal(uid, amount, session) {
    const availableUserBalance = await Transaction.getBalanceByUserUid(uid, undefined, session);

    if (!(amount <= availableUserBalance)) {
      throw new Error("Withdrawal amount exceeds credit balance.",
        {cause: {code: "INSUFFICIENT_FUNDS"}});
    }
  }
}

module.exports = PaypalPaymentService;
