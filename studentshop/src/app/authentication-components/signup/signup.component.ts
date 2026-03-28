import {Component, OnInit} from '@angular/core';
import {Router, RouterLink} from "@angular/router";
import {DialogsService} from "../../dialog-components/dialogs.service";

@Component({
  selector: 'app-signup',
  imports: [
    RouterLink
  ],
  templateUrl: './signup.component.html',
  standalone: true,
  styleUrls: ['../authentication-components.css', './signup.component.css']
})
export class SignupComponent implements OnInit {

  constructor(private dialogsService: DialogsService, private router: Router) { }

  ngOnInit() {
    this.router.navigate(["/"])
      .then(() => this.dialogsService.toggleSignup());
  }
}
