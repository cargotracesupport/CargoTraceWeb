import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail, Section, Sub, Summary } from "@/components/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Goodswala",
  description:
    "What personal data Goodswala collects, why, who can see it, how long it is kept, and how to reach us.",
};

const LAST_UPDATED = "11 November 2026";

// Public page (no sign-in). Linked from the sign-in, customer and tracking
// pages and from every staff profile; also the driver app's store listing URL.
// Keep it in step with the code: retention periods come from the pg_cron jobs
// (Trash purge, session expiry, rate-limit sweep), the tracking-link fields
// from PublicDelivery in src/lib/tracking.ts.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LAST_UPDATED}>
      <Summary>
        <li>
          We collect what&rsquo;s needed to run deliveries: account details
          for staff and drivers, contact and address details for customers,
          and a driver&rsquo;s location while a trip is in progress.
        </li>
        <li>
          Anyone with a delivery&rsquo;s tracking link can see the
          driver&rsquo;s name, phone number and vehicle, and the vehicle&rsquo;s
          live location while it is on the way.
        </li>
        <li>
          We don&rsquo;t sell personal data, and we don&rsquo;t use
          advertising or analytics trackers.
        </li>
        <li>
          Deleted items stay in the Trash for 60 days, then are permanently
          deleted.
        </li>
        <li>
          Write to <Mail /> to see, correct or delete your data.
        </li>
      </Summary>

      <Section title="1. Who we are and what this policy covers">
        <p>
          Goodswala (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a delivery
          tracking service. Businesses use it to create deliveries and assign
          them to drivers. Drivers carry them using the Goodswala driver app
          or website, and the person receiving the goods follows the delivery
          through a tracking link.
        </p>
        <p>
          This policy covers the website at www.goodswala.com and the
          Goodswala driver app. It explains what personal data we process,
          why, and the rights you have under India&rsquo;s Digital Personal
          Data Protection Act, 2023.
        </p>
        <p>
          If a business that uses Goodswala sent you a tracking link, that
          business entered your details and decides why they are needed. You
          can contact that business or us, and we&rsquo;ll help either way.
        </p>
      </Section>

      <Section title="2. What we collect">
        <Sub title="Staff and drivers (administrators, agents and drivers)">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Name, email address, mobile number and role, entered by your
              administrator or by you on your profile page.
            </li>
            <li>
              Your password. Our sign-in provider stores it only in a
              scrambled (hashed) form, so nobody can read it, including us.
            </li>
            <li>The vehicle you drive and the trips assigned to you.</li>
            <li>
              Sign-in records kept by our sign-in provider, such as the time,
              IP address and device type.
            </li>
          </ul>
        </Sub>

        <Sub title="Driver location">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              While a trip assigned to you is in progress (&ldquo;on the
              way&rdquo;), the driver app sends your phone&rsquo;s precise
              location: latitude, longitude, speed, direction and time. It
              sends an update about every 15 seconds while you are moving.
            </li>
            <li>
              <strong>
                This continues while the app is in the background or the
                screen is off,
              </strong>{" "}
              so the customer and your team can follow the delivery. Your
              phone shows a notification for as long as this is happening.
            </li>
            <li>
              The app doesn&rsquo;t send your location when you have no trip
              in progress. On the website, location is sent only while the
              trip page is open.
            </li>
            <li>
              If you turn location off during a trip, your agent and
              administrators are told, so they can contact you.
            </li>
          </ul>
        </Sub>

        <Sub title="Customers (people receiving deliveries)">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Name, mobile number and, optionally, email address.</li>
            <li>
              Pickup and drop-off addresses and their map locations, the
              delivery reference and a description of the goods.
            </li>
            <li>
              Addresses a business saves for you to reuse on later
              deliveries.
            </li>
            <li>
              A drop-off location you set or change yourself on the tracking
              page.
            </li>
            <li>
              The mobile number and delivery reference you enter to see your
              deliveries.
            </li>
          </ul>
        </Sub>

        <Sub title="Technical information">
          <p>
            IP address, browser and device type, and the pages requested. We
            use these to keep the service secure, for example to limit
            repeated attempts and block misuse. Our hosting providers also
            keep standard server logs.
          </p>
        </Sub>

        <p>Goodswala doesn&rsquo;t ask for payment card details or government ID numbers.</p>
      </Section>

      <Section title="3. How we use it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>To run deliveries:</strong> creating and assigning trips,
            showing progress and live location to the business&rsquo;s team
            and the customer, and working out routes and arrival times.
          </li>
          <li>
            <strong>To send updates:</strong> in-app notifications, push
            notifications to drivers, and messages or links shared through
            WhatsApp.
          </li>
          <li>
            <strong>To keep accounts safe:</strong> signing in, checking new
            passwords against known data breaches, limiting repeated attempts
            and investigating misuse.
          </li>
          <li>To answer your questions and requests.</li>
          <li>To meet our legal obligations.</li>
        </ul>
        <p>
          We process personal data with your consent, or where the law
          allows it without consent, for example when you have given us your
          details for a delivery, or for employment purposes.
        </p>
        <p>
          <strong>We don&rsquo;t sell personal data, and we don&rsquo;t use it for advertising.</strong>
        </p>
      </Section>

      <Section title="4. Who can see it">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your business&rsquo;s team.</strong> Administrators see
            everything in their business. Agents see the deliveries they
            manage and the customers they added. Drivers see the trips
            assigned to them, including the customer&rsquo;s name, number
            and addresses. Each business sees only its own data.
          </li>
          <li>
            <strong>Anyone with the tracking link.</strong> The link shows the
            delivery&rsquo;s status, the pickup and drop-off places, the
            customer&rsquo;s name, the driver&rsquo;s name and phone number,
            the vehicle&rsquo;s name and number plate, and, only while the
            delivery is on the way, the vehicle&rsquo;s live location. Anyone
            who has the link can open it, so share it only with people you
            trust.
          </li>
          <li>
            <strong>Service providers</strong> who run parts of Goodswala for
            us, only for that purpose:
            <ul className="mt-1.5 list-[circle] space-y-1 pl-5">
              <li>Supabase: database and sign-in.</li>
              <li>Vercel: website hosting.</li>
              <li>
                Google: maps, place search, address lookup, routes and
                arrival times (addresses and map locations are sent to Google
                for this), and push notifications to the driver app through
                Firebase Cloud Messaging.
              </li>
              <li>
                OSRM, a routing service based on OpenStreetMap: backup route
                calculation (map locations only).
              </li>
              <li>
                Have I Been Pwned: breached-password check. Only the first
                five characters of a hashed version of a new password are
                sent, never the password itself.
              </li>
              <li>
                Meta (WhatsApp): when a delivery update or tracking link is
                sent through WhatsApp.
              </li>
            </ul>
          </li>
          <li>
            <strong>Authorities,</strong> when the law requires it, or to
            protect someone&rsquo;s safety or our rights.
          </li>
        </ul>
      </Section>

      <Section title="5. Where your data is stored">
        <p>
          Our service providers store and process data on servers that may
          be outside India. We use providers that protect it with
          appropriate security, and we follow any restrictions the Government
          of India places on transfers.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Deliveries, customer details and trip routes:</strong> for
            as long as the business uses Goodswala, unless deleted sooner.
          </li>
          <li>
            <strong>Deleted deliveries, customers, addresses and vehicles</strong>{" "}
            go to the Trash, where an administrator can restore them for 60
            days. After that they are permanently deleted, together with a
            deleted delivery&rsquo;s location history and notifications.
          </li>
          <li>
            <strong>Staff and driver accounts</strong> are deleted straight
            away when an administrator removes them. Their past trips stay
            with the business&rsquo;s deliveries, no longer linked to the
            account.
          </li>
          <li>
            <strong>Sign-in sessions</strong> end after 30 days without use,
            and in any case 90 days after signing in.
          </li>
          <li>
            <strong>Records used to limit repeated attempts</strong> (IP
            address, mobile number of a failed sign-in): about 25 hours.
          </li>
        </ul>
      </Section>

      <Section title="7. How we protect it">
        <p>
          Connections are encrypted (HTTPS), passwords are stored only in
          hashed form, and database rules let each person see only what
          their role allows. We also limit repeated attempts and block
          passwords known from data breaches.
        </p>
        <p>
          No system is completely secure. If a breach affects your personal
          data, we will tell you and the Data Protection Board of India as
          the law requires.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>Under the Digital Personal Data Protection Act, 2023, you can:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Ask what personal data we hold about you, how we use it and who
            we have shared it with.
          </li>
          <li>
            Correct or update it. Staff and drivers can change their name and
            mobile number on their profile page.
          </li>
          <li>Ask us to delete it, unless the law requires us to keep it.</li>
          <li>
            Withdraw consent you have given. This doesn&rsquo;t affect what
            we did before. Drivers can turn off location permission at any
            time; trip tracking then stops and their team is told.
          </li>
          <li>
            Nominate someone to use these rights for you if you die or become
            unable to.
          </li>
          <li>
            Complain to us and, if you&rsquo;re not satisfied with our
            answer, to the Data Protection Board of India.
          </li>
        </ul>
        <p>
          Email <Mail /> and include the email address or mobile number
          linked to your data. We may ask you to confirm it&rsquo;s you, and
          we aim to reply within 30 days. If your request is about a delivery
          a business sent you, we may pass it to that business, because it
          controls those details.
        </p>
      </Section>

      <Section title="9. Cookies and browser storage">
        <p>We use only what the service needs to work:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>A sign-in cookie that keeps staff and drivers signed in.</li>
          <li>
            Small settings saved in your browser: your light or dark theme;
            for customers, your mobile number and delivery reference so you
            don&rsquo;t have to type them again; for drivers, the vehicle you
            picked and trip progress; and when you last read your
            notifications.
          </li>
        </ul>
        <p>
          These stay on your device, and you can clear them in your browser
          settings. We don&rsquo;t use advertising or analytics cookies.
        </p>
      </Section>

      <Section title="10. Children">
        <p>
          Goodswala accounts are for people aged 18 and over. We don&rsquo;t
          knowingly collect children&rsquo;s personal data. If you think we
          have, contact us and we will delete it.
        </p>
      </Section>

      <Section title="11. Changes to this policy">
        <p>
          We will update this page when our practices change and change the
          date at the top. If a change is significant, we will tell you in
          the app before it takes effect.
        </p>
      </Section>

      <Section title="12. Contact and grievances">
        <p>
          Goodswala
          <br />
          Email: <Mail />
        </p>
        <p>
          This is also the contact for grievances under the Digital Personal
          Data Protection Act, 2023. Using Goodswala is also subject to our{" "}
          <Link href="/terms" className="font-medium text-primary underline-offset-2 hover:underline">
            Terms of Use
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
