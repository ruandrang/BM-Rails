class User < ApplicationRecord
  SUPPORTED_LOCALES = %w[ko ja en zh].freeze
  DEFAULT_LOCALE = "ko"
  SPEECH_LOCALE_BY_PREFERRED_LOCALE = {
    "ko" => "ko-KR",
    "ja" => "ja-JP",
    "en" => "en-US",
    "zh" => "zh-CN"
  }.freeze

  DEFAULT_GAME_MINUTES = 8
  MIN_GAME_MINUTES = 1
  MAX_GAME_MINUTES = 60
  POSSESSION_SWITCH_PATTERNS = %w[fiba nba].freeze
  DEFAULT_POSSESSION_SWITCH_PATTERN = "fiba"
  VOICE_ANNOUNCEMENT_RATES = [ 1.0, 1.1, 0.9 ].freeze
  DEFAULT_VOICE_ANNOUNCEMENT_RATE = 1.0

  has_secure_password validations: false

  attr_accessor :skip_password_validation

  has_many :identities, dependent: :destroy
  has_many :club_memberships, dependent: :destroy
  has_many :clubs, through: :club_memberships
  has_many :owned_clubs, class_name: "Club", foreign_key: :user_id, dependent: :nullify
  has_many :feedbacks, dependent: :destroy

  validates :nickname, presence: true
  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 6 }, if: :password_required?
  validates :default_game_minutes, numericality: {
    only_integer: true,
    greater_than_or_equal_to: MIN_GAME_MINUTES,
    less_than_or_equal_to: MAX_GAME_MINUTES
  }
  validates :scoreboard_sound_enabled, inclusion: { in: [ true, false ] }
  validates :voice_announcement_enabled, inclusion: { in: [ true, false ] }
  validates :possession_switch_pattern, inclusion: { in: POSSESSION_SWITCH_PATTERNS }
  validates :voice_announcement_rate, inclusion: { in: VOICE_ANNOUNCEMENT_RATES }
  validates :preferred_locale, inclusion: { in: SUPPORTED_LOCALES }

  before_validation { self.email = email.to_s.downcase.strip }
  before_validation :normalize_preferred_locale

  def admin?
    admin
  end

  def display_name
    nickname.presence || name.presence || email.split("@").first
  end

  def social_only?
    password_digest.blank?
  end

  def has_provider?(provider_name)
    identities.exists?(provider: provider_name)
  end

  def default_period_seconds
    default_game_minutes.to_i * 60
  end

  def speech_locale
    SPEECH_LOCALE_BY_PREFERRED_LOCALE.fetch(preferred_locale.to_s, SPEECH_LOCALE_BY_PREFERRED_LOCALE.fetch(DEFAULT_LOCALE))
  end

  private

  def password_required?
    return false if skip_password_validation
    return false if identities.any? && password_digest.blank? && !password.present?
    password.present? || password_digest.blank?
  end

  def normalize_preferred_locale
    value = preferred_locale.to_s
    self.preferred_locale = SUPPORTED_LOCALES.include?(value) ? value : DEFAULT_LOCALE
  end
end
