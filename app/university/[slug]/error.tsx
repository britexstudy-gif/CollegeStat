"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="research-page">
      <h1>University temporarily unavailable</h1>
      <p>We couldn’t retrieve its published records.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
