# Obsługa produkcyjnego serwera RoverSense

Serwer: Ubuntu 24.04 ARM64 w Oracle Cloud, PostgreSQL 17 + TimescaleDB, Caddy, systemd. Adres: https://roversense.duckdns.org.

Opis dotyczy **serwera już uruchomionego**. Wzorce `server/config/` i skrypty `server/scripts/` z repo nie są instalowane automatycznie podczas CD: po zmianie konfiguracji administracyjnej należy wykonać kontrolowaną aktualizację na serwerze. Nie umieszczaj rzeczywistych plików `.env` ani backupów w Git.

## Codzienne kopie zapasowe

Tworzone są logiczne kopie **całej** bazy `roversense` (`pg_dump -Fc`) oraz osobny zrzut obiektów globalnych klastra (`pg_dumpall --globals-only`). Obejmują także tabele TimescaleDB. Pliki zawierają wrażliwe informacje (role i skróty haseł) — katalog jest prywatny. Skrypt zapisuje archiwum najpierw do katalogu tymczasowego, kontroluje możliwość odczytu spisu, zapisuje SHA-256, a dopiero po powodzeniu publikuje katalog backupu. Retencja lokalna: 14 dni.

Poniższe polecenia wykonaj **na serwerze Ubuntu**, mając dostęp do tych plików repozytorium (np. tymczasowy checkout aktualnej gałęzi wdrożeniowej na koncie `ubuntu`). Nie wykonuj `sudo git clone` do katalogów produkcyjnych. Zweryfikuj pliki przed instalacją.

```bash
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -d -o postgres -g postgres -m 0700 /var/backups/roversense/postgresql

sudo install -o root -g root -m 0755 server/scripts/roversense-backup \
  /usr/local/libexec/roversense-backup
sudo install -o root -g root -m 0755 server/scripts/roversense-restore-check \
  /usr/local/libexec/roversense-restore-check

sudo install -o root -g root -m 0644 server/config/roversense-backup.service \
  /etc/systemd/system/roversense-backup.service
sudo install -o root -g root -m 0644 server/config/roversense-backup.timer \
  /etc/systemd/system/roversense-backup.timer

sudo systemctl daemon-reload
sudo systemctl start roversense-backup.service
sudo journalctl -u roversense-backup.service -n 30 --no-pager
sudo systemctl enable --now roversense-backup.timer
sudo systemctl list-timers --all roversense-backup.timer
```

Dopiero po **pierwszej udanej kopii** oraz potwierdzeniu ilości wolnego miejsca na dysku uruchom ręczny test jej odtwarzania w osobnej bazie:

```bash
df -h
sudo -u postgres /usr/local/libexec/roversense-restore-check
```

Test tworzy osobną bazę `roversense_restore_check_<PID>`, włącza rozszerzenie, wywołuje funkcje `timescaledb_pre_restore()` i `timescaledb_post_restore()`, sprawdza istnienie hypertable i usuwa tymczasową bazę. **Nie nadpisuje `roversense`**, ale na czas testu potrzebuje dodatkowego miejsca na dane (w przybliżeniu rozmiaru odtwarzanej bazy) i obciąża CPU/dysk. Nie automatyzuj testu odtwarzania bez uprzedniej oceny wolnych zasobów.

**Obowiązkowe przed uznaniem backupu za kompletny:** skonfiguruj osobną kopię **poza maszyną** (zalecany OCI Object Storage z ograniczonym IAM i szyfrowaniem, albo inna wybrana usługa). Lokalny backup na dysku VM **nie zabezpiecza przed utratą VM/dysku**. Nie deklaruj pełnej ochrony, dopóki nie wykonano rzeczywistego uploadu, retencji i próbnego pobrania kopii. Integracja z zewnętrznym magazynem wymaga jeszcze wskazania bucketu i odpowiednich uprawnień; nie zapisuj kluczy dostępowych w repo.

## Monitoring

**Lokalny:** skrypt sprawdza aktywne usługi PostgreSQL, Caddy i backendu, lokalny i publiczny healthcheck, Timescale hypertable, backup nie starszy niż 36 h oraz nasłuch PostgreSQL. Awaria jest widoczna w `journalctl` i stanie usługi. Jest to lokalny dziennik awarii, **nie zewnętrzne powiadomienie**.

```bash
sudo install -o root -g root -m 0755 server/scripts/roversense-check \
  /usr/local/libexec/roversense-check
sudo install -o root -g root -m 0644 server/config/roversense-healthcheck.service \
  /etc/systemd/system/roversense-healthcheck.service
sudo install -o root -g root -m 0644 server/config/roversense-healthcheck.timer \
  /etc/systemd/system/roversense-healthcheck.timer

sudo systemctl daemon-reload
sudo /usr/local/libexec/roversense-check
sudo systemctl enable --now roversense-healthcheck.timer
sudo systemctl list-timers --all roversense-healthcheck.timer
sudo journalctl -u roversense-healthcheck.service -n 30 --no-pager
```

**Zewnętrzny:** `.github/workflows/monitor.yml` jest wykonywany przez GitHub Actions co 30 minut (UTC), na domyślnej gałęzi **dopiero po merge**. Sprawdza HTTPS oraz `/api/health` spoza Oracle. Upewnij się, że powiadomienia o niepowodzeniach Actions są włączone w GitHub; harmonogram GitHub nie gwarantuje punktualności i sam nie stanowi SLA.

## Bezpieczeństwo i ręczny audyt

```bash
sudo ss -lntup
sudo ufw status verbose
sudo systemctl --failed
sudo systemctl is-enabled roversense.service
sudo systemctl status roversense.service caddy.service postgresql@17-main.service --no-pager
sudo -u postgres psql -d roversense -c "SHOW listen_addresses;"
sudo caddy validate --config /etc/caddy/Caddyfile
sudo sshd -T | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication)'
curl -fsS https://roversense.duckdns.org/api/health
```

Zweryfikuj także reguły ingress w **OCI VCN/NSG lub security list**, niezależnie od UFW. Z zewnątrz dozwolone wyłącznie niezbędne usługi (22 SSH, 80/443 Caddy); PostgreSQL 5432 i Fastify 3000 powinny być niedostępne publicznie. Najlepiej ograniczyć SSH do zaufanych adresów IP, jeśli są stabilne. **Nie włączaj UFW ani nie zmieniaj SSH automatycznie przed upewnieniem się, że zachowasz dostęp do serwera.** Sprawdź odnowienie certyfikatu Caddy, aktualizacje zabezpieczeń systemu i możliwość odtworzenia maszyny z repo oraz kopii poza VM.

## Wydania, rollback i bezpieczeństwo danych

Wydanie z GitHub Actions jest przekazywane przez SSH użytkownikowi `roversense-deploy`, a aktywację przeprowadza `/usr/local/sbin/roversense-activate <SHA>`. Proces tworzy `/srv/roversense/current`, wykonuje migracje, restartuje Fastify i sprawdza lokalne `/api/health`. Przed kolejnym wydaniem sprawdzaj status CI. Po wdrożeniu:

```bash
readlink -f /srv/roversense/current
sudo systemctl status roversense.service --no-pager
sudo journalctl -u roversense.service -n 70 --no-pager
curl -fsS https://roversense.duckdns.org/api/health
```

W razie niepowodzenia `roversense-activate` przywraca poprzedni katalog aplikacji. **Nie cofa migracji SQL ani danych** — przed migracją destrukcyjną potrzebny jest aktualny backup i osobny plan powrotu. Nie wykonuj ręcznego przełączenia wersji, gdy równolegle trwa pipeline CD. Po E1 i E2 należy wstrzymać automatyczny deploy na czas oceny (w GitHub Actions/Environment albo przez wyłączenie odpowiedniego workflow), zachowując CI.

Konto administratora aplikacji nie jest wymagane do uruchomienia monitoringu i backupów. Utworzymy je później, po zakończeniu prac serwerowych.

## Warunki zakończenia konfiguracji

- [ ] Kopia bazy wykonana na OCI i timer działa.
- [ ] Testowe odtworzenie TimescaleDB zakończyło się pomyślnie.
- [ ] Kopia poza VM została przesłana i testowo pobrana.
- [ ] Lokalny healthcheck i timer działają bez błędów.
- [ ] Zewnętrzny workflow monitoringu wykonał udany test po merge.
- [ ] Reguły OCI, UFW, SSH, Caddy, porty 3000/5432 i usługi systemd skontrolowane.
- [ ] Sprawdzono odnowienie HTTPS, procedurę rollbacku i możliwość zatrzymania CD.
- [ ] Potwierdzono ostatni działający deploy API oraz poprawny symlink wydania.

Dopóki powyższe punkty nie zostały wykonane **na serwerze**, nie oznaczaj infrastruktury jako ukończonej wyłącznie na podstawie zielonego CI.
