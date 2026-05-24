import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "../components/ui/button";

export default function NotFoundScreen({ onBack }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
      {/* Glowing blob background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary opacity-5 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* Icon */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Mail size={40} className="text-white" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow">
              !
            </div>
          </div>
        </div>

        {/* 404 number */}
        <p className="text-[120px] sm:text-[160px] font-black text-gray-100 leading-none select-none">
          404
        </p>

        {/* Text */}
        <div className="-mt-6 sm:-mt-10 relative">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            This inbox doesn't exist.
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-sm mx-auto mb-8">
            Looks like this email got lost in transit. The page you're looking for has been unsubscribed — permanently.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              className="bg-primary hover:bg-primary-dark gap-2"
              onClick={onBack}
            >
              <ArrowLeft size={15} /> Back to OutreachOS
            </Button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-gray-400 mt-10">
          OutreachOS · Built by{" "}
          <a href="https://tabcrypt.in" className="text-primary hover:underline">
            Arcen Studio
          </a>
        </p>
      </div>
    </div>
  );
}
