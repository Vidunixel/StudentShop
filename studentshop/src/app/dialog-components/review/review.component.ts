import {Component, Input} from '@angular/core';
import {NgIf} from "@angular/common";
import {DeviceDetectorService} from "ngx-device-detector";
import {DialogsService} from "../dialogs.service";
import {Router, RouterLink} from "@angular/router";
import {Review} from "../../models/Review";
import {GetImageUrlPipe} from "../../pipes/get-image-url.pipe";

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [
    NgIf,
    GetImageUrlPipe,
    RouterLink
  ],
  templateUrl: './review.component.html',
  styleUrls: ['../dialog-components.css', './review.component.css']
})
export class ReviewComponent {
  @Input() reviewData: Review = new Review({ rating: 0, review: "" });

  constructor(private dialogsService: DialogsService, private router: Router) {  }

  navigateToProfile() {
    this.router.navigate(["users", this.reviewData.user?.username])
      .then(status => this.closeAllDialogs());
  }

  closeAllDialogs() {
    this.dialogsService.closeAllDialogs();
  }

}
