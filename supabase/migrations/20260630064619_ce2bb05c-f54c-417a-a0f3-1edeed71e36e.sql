CREATE TABLE public.insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    slug text UNIQUE NOT NULL,
    excerpt text NOT NULL,
    content text NOT NULL,
    category text NOT NULL,
    image_url text,
    is_breaking boolean DEFAULT false,
    published_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_insights_slug ON public.insights(slug);
CREATE INDEX idx_insights_category ON public.insights(category);
CREATE INDEX idx_insights_published_at ON public.insights(published_at DESC);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.insights TO anon, authenticated;
GRANT ALL ON public.insights TO service_role;

CREATE POLICY "Anyone can read insights" ON public.insights
    FOR SELECT USING (true);

CREATE TRIGGER update_insights_updated_at
    BEFORE UPDATE ON public.insights
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.insights (title, slug, excerpt, content, category, image_url, is_breaking, published_at)
VALUES 
('Gold Hits Record High Amid Geopolitical Uncertainty', 'gold-record-high-2026', 'XAU/USD breached the $2,800 psychological level today as investors flock to safe-haven assets.', 'Full analysis of the recent gold price action including ICT killzone impacts and macro-economic drivers.', 'Market News', 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&q=80&w=1200', true, now()),
('The Power of ICT Killzones in Modern Gold Trading', 'power-of-ict-killzones', 'Understanding the London and New York AM sessions is crucial for finding high-probability setups in Gold.', 'In-depth guide to killzone timing, liquidity sweeps, and institutional order flow.', 'Education', 'https://images.unsplash.com/photo-1611974714014-4b50d2ca0c71?auto=format&fit=crop&q=80&w=1200', false, now() - interval '2 hours'),
('NFP Preview: How Jobs Data Will Impact XAU/USD', 'nfp-preview-june-2026', 'Non-Farm Payrolls data is expected to show cooling, potentially fueling a bullish run for gold.', 'Market expectations, potential scenarios, and technical levels to watch during the release.', 'Analysis', 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=1200', false, now() - interval '5 hours'),
('Central Banks Continue Massive Gold Purchases', 'central-banks-gold-accumulation', 'Institutional accumulation of gold by global central banks suggests a long-term bullish structural shift.', 'Analysis of institutional demand and its impact on price floors.', 'Institutional', 'https://images.unsplash.com/photo-1554224155-169746991c99?auto=format&fit=crop&q=80&w=1200', false, now() - interval '1 day');
