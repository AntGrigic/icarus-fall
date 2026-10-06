import { Component, inject, Injectable } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Odustani</button>
      <button mat-flat-button [class.danger]="data.danger" [mat-dialog-close]="true" cdkFocusInitial>
        {{ data.confirmText ?? 'U redu' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
})
class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
}

@Injectable({ providedIn: 'root' })
export class Confirm {
  private readonly dialog = inject(MatDialog);

  async ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialog, { data: options, width: '420px', maxWidth: '92vw' });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
