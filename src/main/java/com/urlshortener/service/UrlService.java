package com.urlshortener.service;

import java.net.URI;
import java.security.SecureRandom;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.urlshortener.dto.ShortenRequest;
import com.urlshortener.dto.ShortenResponse;
import com.urlshortener.model.ShortenedUrl;
import com.urlshortener.repository.UrlRepository;

@Service
public class UrlService {

    private static final String ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int CODE_LENGTH = 7;
    private static final int MAX_RETRIES = 3;

    private final SecureRandom random = new SecureRandom();
    private final UrlRepository urlRepository;

    public UrlService(UrlRepository urlRepository) {
        this.urlRepository = urlRepository;
    }

    public ShortenResponse shorten(ShortenRequest request, String baseUrl) {
        String originalUrl = validateAndNormalise(request.url());

        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            String code = generateCode();
            try {
                ShortenedUrl entity = urlRepository.save(new ShortenedUrl(code, originalUrl));
                return new ShortenResponse(baseUrl + "/r/" + entity.getCode());
            } catch (DataIntegrityViolationException ignored) {
                // Code collision — retry with a new code
            }
        }

        throw new IllegalStateException(
                "Failed to generate a unique short code after " + MAX_RETRIES + " attempts");
    }

    public String resolve(String code) {
        return urlRepository.findByCode(code)
                .map(ShortenedUrl::getOriginalUrl)
                .orElse(null);
    }

    String generateCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    private String validateAndNormalise(String url) {
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("URL must not be blank");
        }

        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid URL: " + url);
        }

        if (uri.getScheme() == null || !uri.getScheme().matches("https?")) {
            throw new IllegalArgumentException("URL must use http or https scheme");
        }

        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("URL must have a valid host");
        }

        return uri.toASCIIString();
    }
}
