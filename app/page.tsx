import Navbar from '@/components/UI/Navbar';

export default function Home() {
  return (
    <main className="immersive-page home-page">
      <div className="hero-sheen home-sheen" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />

      <div className="page-frame">
        <Navbar minimal />

        <section className="home-stage">
          <div className="home-copy">
            <p className="home-kicker">Adapt UI</p>
            <h1 className="home-title">Build interfaces from plain language.</h1>
            <p className="home-tagline">Prompt once. Iterate fast.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
