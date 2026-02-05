class Member < ApplicationRecord
  POSITIONS = ["PG", "SG", "SF", "PF", "C"].freeze
  POSITION_NAMES = {
    "PG" => "포인트 가드",
    "SG" => "슈팅 가드",
    "SF" => "스몰 포워드",
    "PF" => "파워 포워드",
    "C" => "센터"
  }.freeze
  POSITION_COLORS = {
    "PG" => "#3B82F6", # blue
    "SG" => "#8B5CF6", # purple
    "SF" => "#10B981", # green
    "PF" => "#F59E0B", # amber
    "C" => "#EF4444"   # red
  }.freeze

  def position_name
    POSITION_NAMES[position] || position
  end

  def position_color
    POSITION_COLORS[position] || "#6B7280"
  end

  belongs_to :club
  has_many :team_members, dependent: :destroy
  has_many :teams, through: :team_members

  validates :name, presence: true
  validates :position, presence: true, inclusion: { in: POSITIONS }
end
