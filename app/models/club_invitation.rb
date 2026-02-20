class ClubInvitation < ApplicationRecord
  CODE_LENGTH = 6

  belongs_to :club
  belongs_to :created_by, class_name: "User"

  validates :code, presence: true, uniqueness: true
  validate :validate_expiration

  before_validation :generate_code, on: :create

  scope :active, -> {
    where("expires_at IS NULL OR expires_at > ?", Time.current)
      .where("max_uses IS NULL OR use_count < max_uses")
  }

  def expired?
    expires_at.present? && expires_at <= Time.current
  end

  def max_uses_reached?
    max_uses.present? && use_count >= max_uses
  end

  def usable?
    !expired? && !max_uses_reached?
  end

  def use!
    increment!(:use_count)
  end

  private

  def generate_code
    self.code ||= loop do
      candidate = SecureRandom.alphanumeric(CODE_LENGTH).upcase
      break candidate unless ClubInvitation.exists?(code: candidate)
    end
  end

  def validate_expiration
    if expires_at.present? && expires_at <= Time.current
      errors.add(:expires_at, "은(는) 미래 시간이어야 합니다")
    end
  end
end
