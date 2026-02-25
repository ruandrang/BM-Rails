class ClubJoinsController < ApplicationController
  def show
    @invitation = ClubInvitation.active.find_by!(code: params[:code])
    @club = @invitation.club
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: t("club_joins.errors.invalid_code")
  end

  def create
    invitation = ClubInvitation.active.find_by!(code: params[:code])
    club = invitation.club

    if club.membership_for(current_user)
      redirect_to club_path(club), notice: t("club_joins.errors.already_member")
      return
    end

    club.club_memberships.create!(
      user: current_user,
      role: "member",
      joined_at: Time.current
    )
    invitation.use!
    redirect_to club_path(club), notice: t("club_joins.notices.joined")
  rescue ActiveRecord::RecordNotFound
    redirect_to clubs_path, alert: t("club_joins.errors.invalid_code")
  end
end
