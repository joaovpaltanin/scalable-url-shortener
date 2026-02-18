CREATE TABLE IF NOT EXISTS shortened_urls (
    id           BIGSERIAL    PRIMARY KEY,
    code         VARCHAR(10)  NOT NULL UNIQUE,
    original_url TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shortened_urls_code ON shortened_urls (code);
