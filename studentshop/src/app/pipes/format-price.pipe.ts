import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatPrice',
  standalone: true
})
export class FormatPricePipe implements PipeTransform {

  static prefixType = {
    PLUS_AND_MINUS: "default", // Both minus & plus.
    MINUS_ONLY: "minus_only",
    PLUS_ONLY: "plus_only",
    NONE: "none"
  };

  transform(value: any, prefixType: string = FormatPricePipe.prefixType.NONE,
            isReversedPrefix: boolean = false): unknown {
    if (isNaN(value)) return "null";

    let prefix = "";

    if (isReversedPrefix) {
      switch (prefixType) {
        case (FormatPricePipe.prefixType.PLUS_AND_MINUS):
          prefix = value === 0 ? "" : (value > 0 ? "-" : "+");
          break;
        case (FormatPricePipe.prefixType.MINUS_ONLY):
          prefix = value === 0 ? "" : (value > 0 ? "-" : "");
          break;
        case (FormatPricePipe.prefixType.PLUS_ONLY):
          prefix = value === 0 ? "" : (value > 0 ? "" : "+");
          break;
      }
    } else {
      switch (prefixType) {
        case (FormatPricePipe.prefixType.PLUS_AND_MINUS):
          prefix = value === 0 ? "" : (value < 0 ? "-" : "+");
          break;
        case (FormatPricePipe.prefixType.MINUS_ONLY):
          prefix = value === 0 ? "" : (value < 0 ? "-" : "");
          break;
        case (FormatPricePipe.prefixType.PLUS_ONLY):
          prefix = value === 0 ? "" : (value < 0 ? "" : "+");
          break;
      }
    }

    return `${prefix}$${ Math.abs(value).toFixed(2) }`;
  }

}
