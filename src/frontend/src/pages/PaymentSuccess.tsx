import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  useGetStripeSessionStatus,
  useUpdatePaymentStatus,
} from "../hooks/useQueries";

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get("session_id");
  const regId = searchParams.get("reg_id");

  const { data: sessionStatus } = useGetStripeSessionStatus(sessionId);
  const updatePayment = useUpdatePaymentStatus();
  const [statusUpdated, setStatusUpdated] = useState(false);

  useEffect(() => {
    if (sessionStatus?.__kind__ === "completed" && regId && !statusUpdated) {
      setStatusUpdated(true);
      updatePayment.mutate({ regId: BigInt(regId), status: "paid" });
    }
  }, [sessionStatus, regId, statusUpdated, updatePayment.mutate]);

  const isLoading = !sessionStatus;
  const isSuccess = sessionStatus?.__kind__ === "completed";
  const isFailed = sessionStatus?.__kind__ === "failed";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-steel-dark/95 backdrop-blur border-b border-border/50">
        <div className="max-w-[430px] mx-auto px-4 h-14 flex items-center gap-2">
          <img
            src="/assets/cvresports-logo.png"
            alt="CVR eSports Logo"
            className="h-9 w-auto object-contain"
          />
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 max-w-[430px] mx-auto w-full">
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
            data-ocid="payment.loading_state"
          >
            <Loader2 className="w-16 h-16 animate-spin text-orange-glow mx-auto mb-4" />
            <h2 className="font-display text-xl text-foreground">
              VERIFYING PAYMENT...
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              Please wait while we confirm your registration.
            </p>
          </motion.div>
        )}

        {isSuccess && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="text-center"
            data-ocid="payment.success_state"
          >
            <div className="relative inline-block mb-4">
              <CheckCircle className="w-20 h-20 text-orange-glow glow-orange" />
            </div>
            <h2 className="font-display text-3xl font-bold text-foreground text-glow-orange mb-2">
              REGISTERED!
            </h2>
            <h3 className="font-display text-lg text-orange-glow mb-3">
              PAYMENT CONFIRMED
            </h3>
            <p className="text-muted-foreground text-sm mb-8">
              Your registration is confirmed. Get ready to battle!
            </p>
            <Button
              className="btn-primary h-12 px-8 text-base glow-orange"
              onClick={() => navigate({ to: "/" })}
              data-ocid="payment.primary_button"
            >
              BACK TO HOME
            </Button>
          </motion.div>
        )}

        {isFailed && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
            data-ocid="payment.error_state"
          >
            <XCircle className="w-20 h-20 text-destructive mx-auto mb-4" />
            <h2 className="font-display text-3xl font-bold text-destructive mb-2">
              PAYMENT FAILED
            </h2>
            <p className="text-muted-foreground text-sm mb-8">
              {sessionStatus.__kind__ === "failed"
                ? sessionStatus.failed.error
                : "Something went wrong."}
            </p>
            <Button
              className="btn-primary h-12 px-8"
              onClick={() => navigate({ to: "/" })}
              data-ocid="payment.cancel_button"
            >
              TRY AGAIN
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
