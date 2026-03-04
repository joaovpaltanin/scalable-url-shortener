package com.urlshortener.model;

import java.time.Instant;

public class ShortenedUrl {

    private Long id;
    private String code;
    private String originalUrl;
    private Instant createdAt = Instant.now();

    protected ShortenedUrl() {
    }

    public ShortenedUrl(String code, String originalUrl) {
        this.code = code;
        this.originalUrl = originalUrl;
    }

    public Long getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getOriginalUrl() {
        return originalUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
