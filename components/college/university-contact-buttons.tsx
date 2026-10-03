import Image from "next/image";
import { ArrowUpRight, Globe2, Mail } from "lucide-react";
import type { University } from "@/lib/domain";
import { universitySocialLinks } from "@/lib/social-links";

export function UniversityContactButtons({
  university: u,
}: {
  university: University;
}) {
  const socials = universitySocialLinks(u);
  if (!u.website && !u.contact_email && !socials.length) return null;
  return (
    <nav
      className="university-contact-buttons"
      aria-label="University website, contact and social accounts"
    >
      {u.website && (
        <a
          className="profile-contact-button"
          href={u.website}
          target="_blank"
          rel="noreferrer"
        >
          <Globe2 size={17} aria-hidden="true" />
          Official website
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
      {u.contact_email && (
        <a
          className="profile-contact-button"
          href={"mailto:" + u.contact_email}
        >
          <Mail size={17} aria-hidden="true" />
          Contact
        </a>
      )}
      {socials.map((social) => (
        <a
          className="profile-social-button"
          key={social.name}
          href={social.url}
          target="_blank"
          rel="noreferrer"
          aria-label={u.name + " on " + social.name}
          title={social.name}
        >
          <Image
            src={"/logos/social/" + social.icon + ".svg"}
            width={18}
            height={18}
            alt=""
            unoptimized
          />
          <span>{social.name}</span>
        </a>
      ))}
    </nav>
  );
}
