class ClubJoinsController < ApplicationController
  def show
    @invitation = ClubInvitation.active.find_by!(code: params[:code])
    @club = @invitation.club
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: "유효하지 않은 초대 코드입니다."
  end

  def create
    invitation = ClubInvitation.active.find_by!(code: params[:code])
    club = invitation.club

    if club.membership_for(current_user)
      redirect_to club_path(club), notice: "이미 참여 중인 클럽입니다."
      return
    end

    club.club_memberships.create!(
      user: current_user,
      role: "member",
      joined_at: Time.current
    )
    invitation.use!
    redirect_to club_path(club), notice: "클럽에 참여했습니다!"
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: "유효하지 않은 초대 코드입니다."
  end
end
