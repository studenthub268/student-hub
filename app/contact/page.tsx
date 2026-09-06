"use client";

import { useState } from "react";
import { Mail, User, Send, CheckCircle, Loader2, Globe, Clock } from "lucide-react";
import { toast } from "react-hot-toast";
import { sendMessage } from "@/lib/actions/messages";
import { getErrorMessage } from "@/lib/utils";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSending(true);

    try {
      await sendMessage({ 
        name: name.trim(), 
        email: email.trim(), 
        message: message.trim() 
      });

      setIsSent(true);
      toast.success("Message sent successfully!");
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to send message. Please try again."));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-16 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-black">
          Get in Touch
        </h1>
        <p className="mt-4 text-lg text-black/60 font-medium max-w-xl mx-auto">
          Have questions, feedback, or want to collaborate? We&apos;d love to hear from you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* Contact Info Card */}
        <div className="bg-[#111] text-white rounded-[2rem] p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neutral-800/40 via-[#111] to-[#111] opacity-50"></div>

          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Contact Information
            </h2>
            <p className="text-white/60 font-medium text-sm tracking-wider">
              Reach out and we&apos;ll respond as soon as we can.
            </p>
          </div>

          <div className="relative z-10 mt-12 space-y-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-black border-2 border-black">
                <User className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-white/50 mb-1">Name</p>
                <p className="text-lg font-bold">Muhammad Abubakar</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-black border-2 border-black">
                <Mail className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-white/50 mb-1">Email</p>
                <a href="mailto:abubakartanveer826@gmail.com" className="text-lg font-bold hover:text-[#0D9488] transition-colors break-all">
                  abubakartanveer826@gmail.com
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-black border-2 border-black">
                <Globe className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-white/50 mb-1">Support</p>
                <p className="text-lg font-bold">24/7 Academic Support</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-black border-2 border-black">
                <Clock className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-white/50 mb-1">Availability</p>
                <p className="text-lg font-bold">Open to collaborate</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-12 flex gap-2">
            <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold tracking-wider text-white/80">
              Student Developer
            </span>
            <span className="px-3 py-1 bg-[#0D9488] text-black rounded-full text-[10px] font-bold tracking-wider">
              Open to Collaborate
            </span>
          </div>
        </div>

        {/* Message Form Card */}
        <div className="rounded-[2rem] border-2 border-black bg-white p-8 sm:p-10 shadow-[4px_4px_0px_0px_#111]">
          {isSent ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0D9488] border-2 border-black mb-6">
                <CheckCircle className="h-10 w-10 text-black" strokeWidth={2} />
              </div>
              <h3 className="text-2xl font-black tracking-tight text-black">Message Sent!</h3>
              <p className="mt-3 text-black/60 font-medium max-w-xs">
                Thank you for reaching out. We&apos;ll get back to you as soon as possible.
              </p>
              <button
                onClick={() => setIsSent(false)}
                className="mt-8 rounded-full border-2 border-black bg-[#111] px-6 py-3 text-sm font-bold tracking-wider text-white hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
              >
                Send Another
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold tracking-tight text-black mb-8">
                Send a Message
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-bold text-black tracking-wider">Your Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    required
                    className="w-full h-14 px-4 rounded-xl border-2 border-black bg-white text-base font-medium text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/40"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-black tracking-wider">Your Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    required
                    className="w-full h-14 px-4 rounded-xl border-2 border-black bg-white text-base font-medium text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/40"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-black tracking-wider">Message <span className="text-red-500">*</span></label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Your message here..."
                    rows={5}
                    required
                    className="flex w-full rounded-xl border-2 border-black bg-white px-4 py-3 text-base font-medium shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] placeholder:text-black/40 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full flex items-center justify-center gap-2 text-lg h-16 rounded-full border-2 border-black bg-[#111] text-white font-bold tracking-wider hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
