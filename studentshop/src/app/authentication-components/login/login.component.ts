import {Component, OnInit} from '@angular/core';
import {Router, RouterLink} from "@angular/router";
import {DialogsService} from "../../dialog-components/dialogs.service";
import { Location } from '@angular/common';

@Component({
  selector: 'app-login',
  imports: [
    RouterLink
  ],
  templateUrl: './login.component.html',
  standalone: true,
  styleUrls: ['../authentication-components.css', './login.component.css']
})
export class LoginComponent implements OnInit {

  constructor(private dialogsService: DialogsService, private router: Router) { }

  ngOnInit() {
    this.router.navigate(["/"])
      .then(() => this.dialogsService.toggleLogin());
  }
}
