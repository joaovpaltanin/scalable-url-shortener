package com.urlshortener.repository;

import com.urlshortener.model.ShortenedUrl;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UrlRepository extends JpaRepository<ShortenedUrl, Long> {

    Optional<ShortenedUrl> findByCode(String code);

    boolean existsByCode(String code);
}
