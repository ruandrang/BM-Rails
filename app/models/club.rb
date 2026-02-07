class Club < ApplicationRecord
  ICONS = %w[
    basketball whistle court jersey shoes hoop score board trophy
    ball_net ref_hands clipboard
  ].freeze

  # 화면 표시 및 저장용 (한글)
  MEETING_DAYS = %w[월 화 수 목 금 토 일].freeze

  # 날짜 계산용 (한글 -> 영어)
  DAY_MAPPING = {
    "월" => "Monday", "화" => "Tuesday", "수" => "Wednesday", "목" => "Thursday",
    "금" => "Friday", "토" => "Saturday", "일" => "Sunday"
  }.freeze

  belongs_to :user
  has_many :members, dependent: :destroy
  has_many :matches, dependent: :destroy



  validates :name, presence: true
  validates :icon, presence: true, inclusion: { in: ICONS }
  validate :validate_meeting_days

  private

  def validate_meeting_days
    return if meeting_days.blank?

    unless meeting_days.is_a?(Array)
      errors.add(:meeting_days, "must be an array")
      return
    end

    invalid_days = meeting_days - MEETING_DAYS
    if invalid_days.any?
      errors.add(:meeting_days, "contains invalid days: #{invalid_days.join(', ')}")
    end
  end
end
