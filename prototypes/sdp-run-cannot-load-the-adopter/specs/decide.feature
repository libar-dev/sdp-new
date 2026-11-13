@id=decide
Feature: Decide

  Rule: The kernel of libar-platform loads in sdp's own runner

    Scenario: The kernel is imported
      When the kernel is imported
      Then it exports something

  Rule: The convex-test composition loads in sdp's own runner

    Scenario: The simulator composition is imported
      When the simulator composition is imported
      Then it exports something
