package com.urlshortener.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.urlshortener.model.ShortenedUrl;

public interface UrlRepository extends JpaRepository<ShortenedUrl, Long> {

    Optional<ShortenedUrl> findByCode(String code);

    boolean existsByCode(String code);
}
