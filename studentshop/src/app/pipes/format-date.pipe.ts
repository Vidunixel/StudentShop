import {ChangeDetectorRef, OnDestroy, Pipe, PipeTransform} from '@angular/core';

@Pipe({
  name: 'formatDate',
  pure: false,
  standalone: true
})
export class FormatDatePipe implements PipeTransform, OnDestroy {
  private timerId: number;

  static phraseFormat = {
    COUNTDOWN: "countdown",
    EVENT: "event",
  };

  constructor(private cdr: ChangeDetectorRef) {
    // Kick off exactly one timer when this pipe is instantiated.
    this.timerId = window.setInterval(() => {
      // Tells Angular to run change detection again (so transform() re‐runs).
      this.cdr.markForCheck();
    }, 60_000);
  }

  transform(date: Date | undefined, phraseFormat?: string): string {
    if (!date) {
      return "";
    }

    const now: Date = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const absSeconds = Math.abs(seconds);

    const intervals: Record<string, number> = {
      year: 60 * 60 * 24 * 365,
      month: 60 * 60 * 24 * 30,
      week: 60 * 60 * 24 * 7,
      day: 60 * 60 * 24,
      hour: 60 * 60,
      minute: 60
    };

    // Less than a minute: differentiate past vs future.
    if (absSeconds < 60) {
      return seconds < 0 ? "Now" : "Just now";
    }

    for (const interval in intervals) {
      const intervalSeconds = intervals[interval];
      const value = Math.floor(absSeconds / intervalSeconds);
      if (value >= 1) {
        if (seconds >= 0) {
          // Past.
          return value === 1 ? `1 ${interval} ago` : `${value} ${interval}s ago`;
        } else {
          // Future.
          switch (phraseFormat) {
            case FormatDatePipe.phraseFormat.EVENT:
              return value === 1 ? `In 1 ${interval}` : `In ${value} ${interval}s`;
            case FormatDatePipe.phraseFormat.COUNTDOWN:
              return value === 1 ? `1 ${interval} left` : `${value} ${interval}s left`;
            default:
              return value === 1 ? `1 ${interval}` : `${value} ${interval}s`;
          }
        }
      }
    }

    // Fallback (shouldn't normally reach here).
    return seconds < 0 ? "Now" : "Just now";
  }

  ngOnDestroy() {
    clearInterval(this.timerId);
  }

}
