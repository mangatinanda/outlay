"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildUpiPayLink } from "@/lib/upi";
import { cn } from "@/lib/utils";

/**
 * "Pay via UPI" for one suggested payment: a QR code plus an `upi://pay`
 * deep link, both carrying the payee and the exact amount. Never writes —
 * "Record payment" hands off to the parent's existing record sheet.
 */
export function UpiPayDialog({
  open,
  onOpenChange,
  payeeName,
  payeeVpa,
  amountMinor,
  householdName,
  onRecord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payeeName: string;
  payeeVpa: string;
  amountMinor: number;
  householdName: string;
  onRecord: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const link = useMemo(
    () =>
      buildUpiPayLink({
        payeeVpa,
        payeeName,
        amountMinor,
        note: `Outlay · ${householdName}`,
      }),
    [payeeVpa, payeeName, amountMinor, householdName],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {payeeName}</DialogTitle>
          <DialogDescription>
            Scan with any UPI app, or open yours. Then record the payment here —
            Outlay can't see whether it went through.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="overflow-hidden rounded-xl">
            {/* Deliberate non-token colors: a QR must be black-on-white to
                scan reliably in both themes (same exemption as brand SVGs).
                marginSize paints the quiet zone in bgColor. */}
            <QRCodeSVG
              value={link}
              size={200}
              level="M"
              marginSize={2}
              fgColor="#000000"
              bgColor="#ffffff"
              role="img"
              aria-label={`UPI QR code to pay ${payeeName}`}
            />
          </div>
          <p className="font-display font-semibold text-2xl tabular-nums">
            {formatCurrency(amountMinor / 100)}
          </p>
          <p className="break-all text-center text-muted-foreground text-sm">
            {payeeName} · {payeeVpa}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onRecord}>
            Record payment
          </Button>
          {/* A real <a> (role=link), not Button's render prop, which would
              report role=button. Same-tab navigation on purpose: a custom-
              scheme href must not open a new tab, or the OS app chooser
              never fires. */}
          <a href={link} className={cn(buttonVariants())}>
            Open UPI app
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
