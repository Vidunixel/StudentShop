import { Pipe, PipeTransform } from '@angular/core';
import {User} from "../models/User";
import {Note} from "../models/Note";
import {environment} from "../../environments/environment";
import {Environment} from "../models/common";

@Pipe({
  name: 'getImageUrl',
  standalone: true
})
export class GetImageUrlPipe implements PipeTransform {

  CDN_URL: string = "https://cdn.studentshop.com.au";

  transform(item: any): string {
    let returnValue: string = "";

    if (item instanceof User) {
      const bucketName = environment.environment === Environment.PRODUCTION ?
        "public-profile-pictures" : "dev-public-profile-pictures";
      returnValue = this.CDN_URL + `/${bucketName}/` + item.profilePic;

    } else if (item instanceof Note) {
      const bucketName = environment.environment === Environment.PRODUCTION ?
        "public-note-covers" : "dev-public-note-covers";
      returnValue = this.CDN_URL + `/${bucketName}/` + item.noteCover;
    }

    return returnValue;
  }

}
