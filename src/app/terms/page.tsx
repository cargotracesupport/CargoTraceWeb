import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail, Section, Summary } from "@/components/legal";

export const metadata: Metadata = {
  title: "Terms of Use — Goodswala",
  description:
    "The rules for using Goodswala: accounts, drivers, tracking links, acceptable use, and our responsibilities.",
};

const LAST_UPDATED = "11 November 2026";

const linkCls = "font-medium text-primary underline-offset-2 hover:underline";

// Public page (no sign-in), next to /privacy. Google Maps Platform terms
// require the link to Google's Maps terms and privacy policy in section 8.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated={LAST_UPDATED}>
      <Summary>
        <li>
          Goodswala is software for tracking deliveries. The business that
          arranges a delivery is responsible for the goods and the delivery
          itself.
        </li>
        <li>
          Accounts are created by a business&rsquo;s administrator. Keep your
          password to yourself.
        </li>
        <li>
          Live locations, routes and arrival times are estimates and can be
          wrong or delayed.
        </li>
        <li>
          Don&rsquo;t misuse the service: no accessing other people&rsquo;s
          data, attacking the system or tracking people without their
          knowledge.
        </li>
        <li>
          Questions or complaints: <Mail />.
        </li>
      </Summary>

      <Section title="1. About these terms">
        <p>
          These terms are an agreement between you and Goodswala
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;). They apply to the website at
          www.goodswala.com and the Goodswala driver app, and to everyone who
          uses them: administrators and agents of businesses, drivers, and
          customers following a delivery.
        </p>
        <p>
          By using Goodswala you agree to these terms and to how we handle
          personal data as described in our{" "}
          <Link href="/privacy" className={linkCls}>
            Privacy Policy
          </Link>
          . If you use Goodswala for a business, you confirm you are allowed
          to accept these terms for it. If you don&rsquo;t agree, please
          don&rsquo;t use Goodswala.
        </p>
        <p>You must be 18 or older to have a Goodswala account.</p>
      </Section>

      <Section title="2. What Goodswala does">
        <p>
          Goodswala lets businesses create deliveries, assign them to drivers
          and vehicles, and follow them live. Customers can follow their
          delivery through a tracking link and set or change their drop-off
          location.
        </p>
        <p>
          Goodswala provides the software only. The business that arranges a
          delivery is responsible for the goods, the vehicle, the driver and
          the delivery itself, under its own agreement with its customer.
          Questions about a delivery, such as damage, delay or payment, should
          go to that business.
        </p>
        <p>
          If your business pays for Goodswala, the price and payment terms are
          those agreed separately with us.
        </p>
      </Section>

      <Section title="3. Accounts">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Staff and driver accounts are created by your business&rsquo;s
            administrator. There is no public sign-up.
          </li>
          <li>
            Keep your password secret and don&rsquo;t share your account. You
            are responsible for what happens under it.
          </li>
          <li>
            If you think someone else has used your account, change your
            password and tell your administrator or us straight away.
          </li>
          <li>
            Administrators decide who has access and must remove accounts that
            are no longer needed.
          </li>
        </ul>
      </Section>

      <Section title="4. Businesses' responsibilities">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Enter accurate information, and only the personal data needed for
            the delivery.
          </li>
          <li>
            Tell your drivers that their location is tracked while a trip is in
            progress, and tell your customers that their details are used for
            the delivery. Get their consent where the law requires it.
          </li>
          <li>
            Send each tracking link only to the person receiving that delivery.
          </li>
          <li>
            Make sure your staff and drivers follow these terms.
          </li>
        </ul>
      </Section>

      <Section title="5. Drivers">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            While a trip is in progress, the app shares your location with your
            team and the customer, as explained in the Privacy Policy.
          </li>
          <li>
            <strong>
              Don&rsquo;t handle your phone while driving. Set up the trip
              before you set off, and stop safely if you need to use the app.
            </strong>
          </li>
          <li>
            Routes and directions are guidance only. Always follow traffic
            laws, road signs and the conditions in front of you.
          </li>
          <li>
            Mark pickups and deliveries only when they have actually happened.
          </li>
        </ul>
      </Section>

      <Section title="6. Customers and tracking links">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            A tracking link belongs to one delivery. Anyone who has it can see
            that delivery&rsquo;s details, including the driver&rsquo;s name,
            phone number and live location while it is on the way, so
            don&rsquo;t share it publicly.
          </li>
          <li>
            Use the driver&rsquo;s details only for this delivery.
          </li>
          <li>
            If you set or change the drop-off location, make sure it is
            correct. The business and driver will rely on it.
          </li>
          <li>
            A link stops working if the business deletes the delivery.
          </li>
        </ul>
      </Section>

      <Section title="7. Acceptable use">
        <p>You must not:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Access, or try to access, accounts or data that aren&rsquo;t yours,
            including by guessing tracking links.
          </li>
          <li>
            Probe, scan or test the security of Goodswala, get around its
            limits, or overload it, for example with automated requests or
            scraping.
          </li>
          <li>
            Use Goodswala to follow or monitor someone without their knowledge,
            or for anything other than real deliveries.
          </li>
          <li>
            Enter false information, impersonate someone, or upload anything
            unlawful, harmful, defamatory, obscene or infringing, or any
            malicious code.
          </li>
          <li>
            Copy, resell or reverse engineer Goodswala, except as the law
            allows.
          </li>
        </ul>
        <p>
          If you find a security problem, please tell us at <Mail /> instead of
          testing it further.
        </p>
      </Section>

      <Section title="8. Our software, your data and Google Maps">
        <p>
          Goodswala&rsquo;s software, name, logo and design belong to us. We
          give you a personal, non-transferable right to use Goodswala while
          you have access, under these terms.
        </p>
        <p>
          The data a business enters remains its own. The business gives us
          permission to store and process it only to provide Goodswala, as
          described in the Privacy Policy.
        </p>
        <p>
          Goodswala uses Google Maps. By using Goodswala you also agree to the{" "}
          <a
            href="https://maps.google.com/help/terms_maps.html"
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
          >
            Google Maps/Google Earth Additional Terms of Service
          </a>{" "}
          and the{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
          >
            Google Privacy Policy
          </a>
          .
        </p>
      </Section>

      <Section title="9. Availability and changes to the service">
        <p>
          We work to keep Goodswala running, but we can&rsquo;t promise it will
          always be available or free of errors. We may change, add or remove
          features, and may pause the service for maintenance or security.
        </p>
        <p>
          Locations, routes and arrival times depend on phone GPS, mobile
          networks and map data, so they can be inaccurate or delayed. A
          driver who is parked or out of signal stops updating.
        </p>
      </Section>

      <Section title="10. Limits of our responsibility">
        <p>
          To the extent the law allows, Goodswala is provided &ldquo;as
          is&rdquo; and &ldquo;as available&rdquo;. We are not responsible for:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Loss of or damage to goods, or late or failed deliveries; these are
            the responsibility of the business that arranged the delivery.
          </li>
          <li>
            Decisions made on the basis of an estimated location or arrival
            time.
          </li>
          <li>
            Problems caused by services we don&rsquo;t control, such as mobile
            networks, phones, Google Maps or WhatsApp.
          </li>
          <li>Indirect losses, such as lost profit or business.</li>
        </ul>
        <p>
          Where we are liable, our total liability is limited to the amount
          your business paid us for Goodswala in the 12 months before the
          claim. Nothing in these terms limits any liability that cannot be
          limited by law.
        </p>
        <p>
          A business is responsible to us for claims arising from data it
          entered without the notice or consent the law requires, or from its
          users breaking these terms.
        </p>
      </Section>

      <Section title="11. Suspension and ending">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            We may suspend or close an account that breaks these terms or puts
            Goodswala or other users at risk. Where possible, we will tell the
            business first.
          </li>
          <li>
            A business can stop using Goodswala at any time and ask us to
            delete its data.
          </li>
          <li>
            Deleted items stay in the Trash for 60 days and are then
            permanently deleted.
          </li>
          <li>
            Sections 7, 8 and 10 continue to apply after use ends.
          </li>
        </ul>
      </Section>

      <Section title="12. Changes to these terms">
        <p>
          We may update these terms. We will change the date at the top, and
          for significant changes we will tell you in the app before they take
          effect. If you keep using Goodswala after that, the new terms apply.
        </p>
      </Section>

      <Section title="13. Law and disputes">
        <p>
          These terms are governed by the laws of India, and the courts of
          India have jurisdiction over any dispute. Before going to court,
          please write to us so we can try to sort it out.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          Goodswala
          <br />
          Email: <Mail />
        </p>
      </Section>
    </LegalPage>
  );
}
