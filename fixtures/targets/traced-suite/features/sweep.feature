@regression
Feature: Error catalogue sweep

  @E2E-G99-001
  Scenario: Row 11 refuses with the catalogue message
    Given the form
    Then the message is shown

  @E2E-G99-001
  Scenario: Row 12 refuses with the catalogue message
    Given the form
    Then the message is shown

  @E2E-G99-001
  Scenario: Row 13 refuses with the catalogue message
    Given the form
    Then the message is shown
