class TeamMember < ApplicationRecord
  belongs_to :team
  belongs_to :member

  validates :member_id, uniqueness: { scope: :team_id, message: "는 이미 해당 팀에 배정되어 있습니다" }
end
