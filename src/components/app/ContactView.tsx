"use client";

import { useState } from "react";
import { Mail, MessageSquare, Github, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeading } from "./shared";
import { useToast } from "@/hooks/use-toast";

export default function ContactView() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    // Prototype: no backend mailbox — acknowledge and reset.
    toast({
      title: "Message sent (demo)",
      description: "This prototype does not transmit email — but thanks for saying hello!",
    });
    setName("");
    setEmail("");
    setMessage("");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <SectionHeading
        title="Contact"
        description="Questions about coverage, data or the project? Reach out — this prototype is an independent, open-source study build."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Send a message</CardTitle>
            <CardDescription>We read everything — typical response within two business days.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-message">Message</Label>
                <Textarea
                  id="contact-message"
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what you'd like to see covered…"
                />
              </div>
              <Button type="submit" className="gap-1.5">
                <Mail className="h-4 w-4" aria-hidden /> Send message
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <MessageSquare className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">Product feedback</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Missing a court, filter or chart? Tell us — the roadmap is shaped by user requests.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Github className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">Source code</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The full stack (Next.js + Prisma + SQLite) lives in the project repository with setup instructions.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">About the data</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                All cases, companies, patents and law firms in this prototype are synthetic and refreshed by a simulated
                daily pipeline.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
