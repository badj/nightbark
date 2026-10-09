# FIXTURE — the NEAR MISS that matters most.
# A tag on the FEATURE line is INHERITED by every scenario below it. That makes 1 id and 3
# occurrences, which is CORRECT and extremely common. Counting occurrences would fire here, and
# firing on a properly-traced suite is the fastest way to get the whole tool ignored.
@regression @REQ01-AC01
Feature: Registration

  @[700110]
  Scenario: A new customer registers with an email address
    Given a new customer
    Then the account exists

  @[700111]
  Scenario: A new customer registers and skips the passkey
    Given a new customer
    Then the account exists

  @[700112]
  Scenario: A new customer registers on mobile
    Given a new customer
    Then the account exists
