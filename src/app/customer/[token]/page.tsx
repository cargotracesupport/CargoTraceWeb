import CustomerHome from "@/components/CustomerHome";

// Customer home via home link: /customer/<tracking-token>. The unguessable
// token (the same credential as the tracking link) logs the customer in
// automatically — no typing. Meant to be included in order messages.
export default function CustomerHomeTokenPage({
  params,
}: {
  params: { token: string };
}) {
  return <CustomerHome token={params.token} />;
}
