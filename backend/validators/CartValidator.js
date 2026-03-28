const Validator = require("./Validator");

class CartValidator extends Validator {
  /************************************************************************************************
   * Standard Requests
   * **********************************************************************************************/

  /**
   * Parse and return parameters for updateCart requests.
   * @param params The parameters to parse.
   * @param uid The uid of the logged-in user.
   * @return {Promise<{}>}
   */
  static async parseUpdateCartRequestParams(params, uid) {
    let parsedParams = {
      fields: {}
    };
    parsedParams.fields.cartItems = super._validateUserCartSchema(params?.fields?.cartItems) ?
      await super._parseUserCart(params?.fields?.cartItems, uid) : undefined;

    return parsedParams;
  }
}

module.exports = CartValidator;