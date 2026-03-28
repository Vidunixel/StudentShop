import { Pipe, PipeTransform } from '@angular/core';
import {Note} from "../models/Note";

@Pipe({
  name: 'getRating',
  standalone: true
})
export class GetRatingPipe implements PipeTransform {

  transform(item: Note | undefined): { starText: string, percentageText: string, countText: string, backgroundColour: string } {
    if (item instanceof Note) {
      return this.getRatingInfo(item);
    }
    return { starText: "No Reviews", percentageText: "No Reviews", countText: "", backgroundColour: "var(--neutral--200)" };
  }

  private getRatingInfo(item: Note): { starText: string, percentageText: string, countText: string, backgroundColour: string } {
    let countText = "";
    let starText = "No Reviews";
    let percentageText = "No Reviews";
    let backgroundColour = "var(--neutral--200)";
    const { ratingCountTotal, ratingAverage } = this.getRatingAvgAndCount(item);

    if (ratingAverage && ratingCountTotal > 0) {
      const ratingPercentage = ratingAverage * 20;

      countText = `(${ratingCountTotal})`;
      starText = ratingAverage.toFixed(1);
      percentageText = `${ratingPercentage.toFixed(0)}%`;
      backgroundColour = this.getRatingColour(ratingPercentage);
    }

    return { starText, percentageText, countText, backgroundColour };
  }

  private getRatingAvgAndCount(item: Note): { ratingCountTotal: number, ratingAverage: number } {
    const oneStar = item.ratingCount["1"] ?? 0;
    const twoStar = item.ratingCount["2"] ?? 0;
    const threeStar = item.ratingCount["3"] ?? 0;
    const fourStar = item.ratingCount["4"] ?? 0;
    const fiveStar = item.ratingCount["5"] ?? 0;

    const ratingSum = 1.0 * oneStar + 2.0 * twoStar + 3.0 * threeStar + 4.0 * fourStar + 5.0 * fiveStar;
    const ratingCountTotal = oneStar + twoStar + threeStar + fourStar + fiveStar;
    const ratingAverage = ratingCountTotal > 0 ? (ratingSum / ratingCountTotal) : 0;

    return { ratingCountTotal, ratingAverage };
  }

  private getRatingColour(rating: number): string {
    // Colors: Red (20%), Yellow (60%), Green (100%)
    const colors = {
      red: { r: 255, g: 99, b: 71 }, // Tomato (#FF6347)
      yellow: { r: 255, g: 215, b: 0 }, // Gold (#FFD700)
      green: { r: 144, g: 238, b: 144 }, // LightGreen (#90EE90)
    };

    let startColor, endColor, ratio;

    if (rating <= 60) {
      // Interpolate between Red and Yellow
      startColor = colors.red;
      endColor = colors.yellow;
      ratio = (rating - 20) / 40; // Map 20–60 to 0–1
    } else {
      // Interpolate between Yellow and Green
      startColor = colors.yellow;
      endColor = colors.green;
      ratio = (rating - 60) / 40; // Map 60–100 to 0–1
    }

    // Interpolate the RGB values
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * ratio);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * ratio);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * ratio);

    return `rgb(${r}, ${g}, ${b})`;
  }

}
