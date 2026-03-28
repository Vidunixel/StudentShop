import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkWithCredentialComponent } from './link-with-credential.component';

describe('LinkWithCredentialComponent', () => {
  let component: LinkWithCredentialComponent;
  let fixture: ComponentFixture<LinkWithCredentialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkWithCredentialComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LinkWithCredentialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
