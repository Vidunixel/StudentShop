import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RejectNoteComponent } from './reject-note.component';

describe('EditNoteComponent', () => {
  let component: RejectNoteComponent;
  let fixture: ComponentFixture<RejectNoteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RejectNoteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RejectNoteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
