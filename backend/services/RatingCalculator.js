class RatingCalculator {

  /**
   * Calculate and return the average rating and ratingCount after adding a rating.
   * @param {1,2,3,4,5} rating Rating to add.
   * @param ratingCount Rating count to modify.
   * @return {{ratingCount: (number)}}
   */
  static addRating(rating, ratingCount) {
    // Calculate ratingCount with the new review added.
    const newRatingCount = {...ratingCount};
    newRatingCount[rating.toString()] = (newRatingCount[rating]) + 1; // Add new rating.

    return { ratingCount: newRatingCount };
  }

  /**
   * Calculate and return the average rating and ratingCount after replacing an existing rating.
   * @param {1,2,3,4,5} rating Rating to add.
   * @param {1,2,3,4,5} oldRating Existing rating to remove.
   * @param ratingCount Rating count to modify.
   * @return {{ratingCount: (number)}}
   */
  static updateRating(rating, oldRating, ratingCount) {
    // Calculate ratingCount with updated rating.
    const newRatingCount = {...ratingCount};
    newRatingCount[oldRating.toString()] = (newRatingCount[oldRating]) - 1; // Remove old rating.
    newRatingCount[rating.toString()] = (newRatingCount[rating]) + 1; // Add new rating.

    return { ratingCount: newRatingCount };
  }

  /**
   * Calculate and return the average rating and ratingCount after removing an existing rating.
   * @param {1,2,3,4,5} rating Existing rating to remove.
   * @param ratingCount Rating count to modify.
   * @return {{ratingCount: (number)}}
   */
  static deleteRating(rating, ratingCount) {
    // Calculate ratingCount with removed rating.
    const newRatingCount = {...ratingCount};
    newRatingCount[rating.toString()] = (newRatingCount[rating]) - 1; // Remove current rating.

    return { ratingCount: newRatingCount };
  }
}

module.exports = RatingCalculator;