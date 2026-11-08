import React from 'react';

export function TundraOffroadSection() {
  return (
    <section className="relative bg-zinc-950 py-16 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Column: Text & Value Proposition */}
          <div className="space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-red-600/10 border border-red-600/20 text-red-500 text-xs font-semibold uppercase tracking-wider">
              <span>Next-Level Capability</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Conquer Any Terrain with the <span className="text-red-600">Toyota Tundra</span>
            </h2>
            
            <p className="text-zinc-400 text-base leading-relaxed">
              Experience uncompromising power and rugged off-road engineering. Whether navigating rocky trails or highway cruising, the Tundra’s advanced suspension and high-torque powertrain adapt seamlessly to your next adventure.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-1 min-w-[140px]">
                <div className="text-2xl font-bold text-white">i-FORCE MAX</div>
                <div className="text-xs text-zinc-400 mt-1">Twin-Turbo V6 Hybrid</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-1 min-w-[140px]">
                <div className="text-2xl font-bold text-white">Multi-Terrain</div>
                <div className="text-xs text-zinc-400 mt-1">Select & Crawl Control</div>
              </div>
            </div>
          </div>

          {/* Right Column: Real-World Video Embed */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 bg-zinc-900">
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src="https://www.youtube-nocookie.com/embed/HWA3oHgZguU"
              title="Toyota Tundra Off-Road Test Drive"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>

        </div>
      </div>
    </section>
  );
}