import { whatsappUrl } from "@/lib/share";
import { WhatsApp } from "@/components/icons";

/**
 * "Send on WhatsApp" link — opens WhatsApp with the message prefilled (the
 * sender taps send). Server-renderable: it's just an anchor to a wa.me URL.
 */
export default function WhatsAppLink({
  phone,
  message,
  label = "WhatsApp",
  className,
  title = "Send this link on WhatsApp",
}: {
  phone: string | null | undefined;
  message: string;
  label?: string;
  className?: string;
  title?: string;
}) {
  return (
    <a
      href={whatsappUrl(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={
        className ??
        "ct-btn-ghost px-2 py-1 text-xs text-[#128c3e] hover:text-[#25D366]"
      }
    >
      <WhatsApp className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
