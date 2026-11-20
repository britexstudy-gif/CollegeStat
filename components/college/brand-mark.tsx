/** The CollegeStat "C:S" mark as vector paths (source: public/brand/collegestat-mark.svg).
 * It paints in currentColor, so CSS sets its colour per theme (var(--cs-accent) by default). */
export function BrandMark({ className = "brand-mark", title }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="400 270 992 403"
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M520 283H761Q783 283 783 305V354H530Q505 354 505 379V567Q505 592 530 592H781V637Q781 659 759 659H518Q505 659 492 647L424 580Q412 568 412 552V392Q412 376 424 364L492 296Q505 283 520 283Z" /><rect x="781" y="353" width="80" height="70" rx="6" /><rect x="779" y="527" width="81" height="66" rx="6" /><path d="M987 305Q987 283 1009 283H1278Q1300 283 1300 305V354H987Z" /><rect x="1298" y="353" width="82" height="70" rx="6" /><path d="M916 359Q916 353 922 353H988V372Q988 395 1012 404L1300 466Q1340 474 1360 500Q1380 525 1380 555V587Q1380 593 1374 593H1300V575Q1300 548 1268 537L980 471Q950 462 932 435Q916 410 916 385Z" /><rect x="916" y="527" width="84" height="66" rx="6" /><path d="M1000 592H1300V637Q1300 659 1278 659H1022Q1000 659 1000 637Z" />
    </svg>
  );
}
