import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialSignupComponent } from './social-signup.component';

describe('SocialSignupComponent', () => {
  let component: SocialSignupComponent;
  let fixture: ComponentFixture<SocialSignupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialSignupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SocialSignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
